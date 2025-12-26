import { NextResponse } from 'next/server';
import { readFile, mkdir } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

export async function POST(request) {
    try {
        const { imagePath, adjustments, sessionId, imageId } = await request.json();

        if (!imagePath || !adjustments) {
            return NextResponse.json({ error: 'Missing data' }, { status: 400 });
        }

        // Sanitize path (strip query params)
        const cleanPath = imagePath.split('?')[0];
        const userDataPath = process.env.USER_DATA_PATH;

        let absoluteInputPath;
        let sessionDir;
        let publicUrlPrefix;

        if (userDataPath) {
            const relativePath = cleanPath.replace('/api/media/', '');
            absoluteInputPath = path.join(userDataPath, relativePath);
            sessionDir = path.join(userDataPath, 'processed', sessionId || 'default');
            publicUrlPrefix = `/api/media/processed/${sessionId || 'default'}`;
        } else {
            const relativePath = cleanPath.startsWith('/') ? cleanPath.slice(1) : cleanPath;
            absoluteInputPath = path.join(process.cwd(), 'public', relativePath);
            sessionDir = path.join(process.cwd(), 'public', 'uploads', sessionId || 'default', 'processed');
            publicUrlPrefix = `/uploads/${sessionId || 'default'}/processed`;
        }

        // Ensure output dir exists
        await mkdir(sessionDir, { recursive: true });

        const outputFilename = path.basename(cleanPath);
        const absoluteOutputPath = path.join(sessionDir, outputFilename);
        const publicOutputPath = `${publicUrlPrefix}/${outputFilename}`;

        // Process with Sharp
        const imageBuffer = await readFile(absoluteInputPath);
        let pipeline = sharp(imageBuffer);
        const metadata = await pipeline.metadata();
        const hasAlpha = metadata.hasAlpha;

        // --- 1. White Balance (Temperature & Tint) ---
        // Range -100 to 100. Scaled to -0.5 to 0.5.
        // Normalized to preserve luminance (Approx weights: R:0.3, G:0.6, B:0.1)
        const t = (adjustments.temperature || 0) / 200;
        const tint = (adjustments.tint || 0) / 200;

        // Temperature: Warm (+R, -B). Cool (-R, +B).
        // Luminance shift: +R adds 0.3, -B removes 0.1. Net +0.2.
        // Compensate Green: -0.2/0.6 = ~-0.33
        const tR = t;
        const tB = -t;
        const tG = -t * 0.33;

        // Tint: Magenta (+R, +B, -G). Green (-R, -B, +G).
        // +Magenta (Tint>0): +R, +B. Luma increase ~0.4. Green must drop ~0.66.
        const tiR = tint;
        const tiB = tint;
        const tiG = -tint * 0.7;

        // Recomb Matrix: [R, G, B, (A)]
        if (hasAlpha) {
            pipeline = pipeline.recomb([
                [1 + tR + tiR, 0, 0, 0],
                [0, 1 + tG + tiG, 0, 0],
                [0, 0, 1 + tB + tiB, 0],
                [0, 0, 0, 1]
            ]);
        } else {
            pipeline = pipeline.recomb([
                [1 + tR + tiR, 0, 0],
                [0, 1 + tG + tiG, 0],
                [0, 0, 1 + tB + tiB]
            ]);
        }

        // --- 2. Color (Saturation & Vibrance) ---
        const sat = (adjustments.saturation || 0);
        const vib = (adjustments.vibrance || 0);
        const bright = (adjustments.brightness || 0);

        // Saturation compensation for brightness: 
        // Lifts saturation slightly as brightness increases to prevent washing out
        const brightComp = bright > 0 ? (bright / 10) : 0;

        const saturationMult = 1 + (sat / 100) + (vib / 75) + (brightComp / 100);

        pipeline = pipeline.modulate({
            saturation: saturationMult
        });

        // --- 3. Light (LUT-based) ---
        const lut = Buffer.alloc(256);
        const b = (adjustments.brightness || 0);
        const con = (adjustments.contrast || 0);
        const h = (adjustments.highlights || 0);
        const s = (adjustments.shadows || 0);
        const w = (adjustments.whites || 0);
        const bl = (adjustments.blacks || 0);

        // Levels Calculations
        let inBlack = 0, inWhite = 255, outBlack = 0, outWhite = 255;
        // Blacks: +Lift Output Black, -Crush Input Black
        if (bl > 0) outBlack = bl * 0.6; // Scale down slightly
        else inBlack = -bl * 0.6;
        // Whites: +Push Input White (Clip), -Dim Output White
        if (w > 0) inWhite = 255 - (w * 0.6);
        else outWhite = 255 + (w * 0.6);

        // Contrast S-Curve Factor
        // Formula: f = (259*(C+255))/(255*(259-C))
        const contrastFactor = (259 * (con + 255)) / (255 * (259 - con));

        for (let i = 0; i < 256; i++) {
            let val = i;

            // 1. Levels (Histogram Stretch)
            val = outBlack + ((val - inBlack) * (outWhite - outBlack)) / (inWhite - inBlack);
            val = Math.max(0, Math.min(255, val));

            // 2. Brightness (Highlight-Preserving)
            if (b > 0) {
                const boostWeight = 1 - Math.pow(val / 255, 2);
                val += b * boostWeight;
            } else {
                val += b;
            }

            // 3. Contrast (S-Curve)
            if (con !== 0) {
                val = contrastFactor * (val - 128) + 128;
            }

            // 4. Targeted Highlights/Shadows (Applied after global contrast to Refine)

            // Shadows (Narrow: 0-120)
            if (s !== 0 && val < 120) {
                const sWeight = Math.pow(Math.max(0, 1 - (val / 120)), 2.0);
                const sBoost = s * sWeight * 1.5;
                // Add boost but clamp to ensure we don't invert or break continuity
                val += sBoost;
            }

            // Highlights (Narrow: 160-255)
            if (h !== 0 && val > 160) {
                const hWeight = Math.pow(Math.max(0, (val - 160) / 95), 2.0);
                val += h * hWeight * 2.0;
            }

            lut[i] = Math.max(0, Math.min(255, Math.round(val)));
        }

        pipeline = pipeline.lut(lut);

        // --- 4. Texture (Sharpness & Clarity) ---
        const sharpness = adjustments.sharpness || 0;
        if (sharpness > 0) {
            // Aggressive Sharpening (Unsharp Mask)
            pipeline = pipeline.sharpen({
                sigma: 1.0 + (sharpness / 50),
                m1: 1.0,
                m2: 2.0 + (sharpness / 20)
            });
        } else if (sharpness < 0) {
            // Smooth Gaussian Blur
            // Sigma range 0.3 to 10
            const blurSigma = Math.abs(sharpness) / 10;
            if (blurSigma >= 0.3) {
                pipeline = pipeline.blur(blurSigma);
            }
        }

        if ((adjustments.clarity || 0) !== 0) {
            pipeline = pipeline.sharpen({
                sigma: 6,
                m1: 0,
                m2: 3 + ((adjustments.clarity || 0) / 12),
                x1: 2,
                y2: 10,
                y3: 20
            });
        }

        await pipeline.toFile(absoluteOutputPath);

        return NextResponse.json({
            success: true,
            editedPath: publicOutputPath,
            imageId: imageId
        });

    } catch (error) {
        console.error('Edit API Error:', error);
        return NextResponse.json({ error: 'Edit failed: ' + error.message }, { status: 500 });
    }
}
