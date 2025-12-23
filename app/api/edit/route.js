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
        // Range -100 to 100. Scaled to -0.5 to 0.5 for visible shift.
        const temp = (adjustments.temperature || 0) / 200;
        const tint = (adjustments.tint || 0) / 200;

        // Recomb Matrix: [R, G, B, (A)]
        if (hasAlpha) {
            pipeline = pipeline.recomb([
                [1 + temp + tint, 0, 0, 0],
                [0, 1 - tint, 0, 0],
                [0, 0, 1 - temp + tint, 0],
                [0, 0, 0, 1]
            ]);
        } else {
            pipeline = pipeline.recomb([
                [1 + temp + tint, 0, 0],
                [0, 1 - tint, 0],
                [0, 0, 1 - temp + tint]
            ]);
        }

        // --- 2. Color (Saturation & Vibrance) ---
        const sat = (adjustments.saturation || 0);
        const vib = (adjustments.vibrance || 0);
        // Vibrance is slightly "stronger" per unit in this approximation
        const saturationMult = 1 + (sat / 100) + (vib / 75);

        pipeline = pipeline.modulate({
            saturation: saturationMult
        });

        // --- 3. Light (LUT-based: Brightness, Contrast, Highlights, Shadows, Whites, Blacks) ---
        const lut = Buffer.alloc(256);
        const b = (adjustments.brightness || 0);
        const c = 1 + (adjustments.contrast || 0) / 75; // More aggressive contrast anchor
        const h = (adjustments.highlights || 0);
        const s = (adjustments.shadows || 0);
        const w = (adjustments.whites || 0);
        const bl = (adjustments.blacks || 0);

        for (let i = 0; i < 256; i++) {
            let val = i;

            // Blacks (Remap 0-50 range)
            if (bl !== 0) {
                const blWeight = Math.max(0, 1 - (i / 60));
                val += (bl * 0.8) * blWeight;
            }

            // Contrast (Midpoint 128)
            val = 128 + (val - 128) * c;

            // Brightness (Global offset)
            val += b;

            // Shadows (Influence 0-180)
            if (s !== 0 && i < 180) {
                const sWeight = Math.pow(Math.max(0, 1 - (i / 180)), 1.5);
                val += s * sWeight * 1.5;
            }

            // Highlights (Influence 80-255)
            if (h !== 0 && i > 80) {
                const hWeight = Math.pow(Math.max(0, (i - 80) / 175), 1.5);
                val += h * hWeight * 1.5;
            }

            // Whites (Influence 180-255)
            if (w !== 0 && i > 180) {
                const wWeight = Math.pow(Math.max(0, (i - 180) / 75), 2);
                val += w * wWeight * 1.0;
            }

            lut[i] = Math.max(0, Math.min(255, Math.round(val)));
        }

        pipeline = pipeline.lut(lut);

        // --- 4. Texture (Sharpness & Clarity) ---
        if ((adjustments.sharpness || 0) !== 0) {
            pipeline = pipeline.sharpen({ sigma: 1 + Math.abs(adjustments.sharpness) / 30 });
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
