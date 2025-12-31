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
            // Overwrite In-Place: Output Dir is same as Input Dir
            sessionDir = path.dirname(absoluteInputPath);
            publicUrlPrefix = path.dirname(cleanPath);
        } else {
            const relativePath = cleanPath.startsWith('/') ? cleanPath.slice(1) : cleanPath;
            absoluteInputPath = path.join(process.cwd(), 'public', relativePath);
            // Overwrite In-Place: Output Dir is same as Input Dir
            sessionDir = path.dirname(absoluteInputPath);
            publicUrlPrefix = path.dirname(cleanPath);
        }

        // Ensure output dir exists (redundant if checking input, but safe)
        await mkdir(sessionDir, { recursive: true });

        const outputFilename = path.basename(cleanPath);
        const absoluteOutputPath = absoluteInputPath; // OVERWRITE
        const publicOutputPath = cleanPath; // Same URL (Frontend will append ?t=...)

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

        // Tint: Magenta (+R, +B, -G). Green (-R, -B, +G).
        const tiR = tint;
        const tiB = tint;
        const tiG = -tint; // Direct reciprocal for Green

        // Combined Diagonal Matrix weights:
        // Temperature (Warmth): Boost Red, Cut Blue. Keep Green relatively high for Yellow.
        // Temperature (Coolness): Cut Red, Boost Blue. 
        const tR = t;
        const tB = -t;
        const tG = t * 0.8; // Stronger green boost for "Golden/Yellow" warmth vs Red warmth

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

        // --- 3. Light (Using Linear/Modulate instead of LUT) ---
        const b = (adjustments.brightness || 0);   // -100 to 100
        const con = (adjustments.contrast || 0);   // -100 to 100
        const w = (adjustments.whites || 0);       // -100 to 100
        const bl = (adjustments.blacks || 0);      // -100 to 100
        // Shadows/Highlights require mask or complex curves, skipping simple approximation for now or using very subtle gamma if needed.
        // For standard "Light" controls:

        // A. Brightness (Simple offset vs Exposure)
        // Sharp's modulate.brightness is a multiplier (e.g. 0.5 to 1.5).
        // Let's map -100..100 to 0.5..1.5 roughly, or use linear offset.
        // Lightroom "Brightness" is often exposure (multiplier). "Offset" is wash/haze.
        // Let's stick to standard Modulate brightness (Multiplier) for major exposure changes.
        const brightnessMult = 1 + (b / 100);

        // B. Contrast (S-Curve approximation via linear expansion)
        // factor = (259 * (C + 255)) / (255 * (259 - C))
        // newVal = factor * (oldVal - 128) + 128
        // This is a linear operation: slope = factor, offset = 128*(1-factor)
        const contrastFactor = (259 * (con + 255)) / (255 * (259 - con));
        const contrastOffset = 128 * (1 - contrastFactor);

        // C. Levels (Whites/Blacks) -> Linear Expansion
        // Blacks: Lifting blacks (make them gray) or crushing them?
        // Typically "Blacks" slider shifts the black point.
        // Whites: shifts the white point.
        // We can fold this into the linear transformation.
        // Linear(a, b) -> pixel * a + b

        // Combine Contrast and Levels into single Linear op to avoid clipping in between
        let slope = contrastFactor;
        let intercept = contrastOffset;

        // Apply Brightness via Modulate first (standard order usually) or last?
        // Sharp applies operations effectively sequentially.

        // Whites/Blacks approximations:
        // +Blacks: add offset, -Blacks: subtract offset (crush)
        // +Whites: increase slope?

        // Let's keep it simple and robust:
        // 1. Modulate (Brightness, Saturation)
        // 2. Linear (Contrast)

        // Additional linear offset for blacks/whites (very rough approx)
        intercept += (bl * 0.5); // Shift black point
        slope += (w * 0.01);     // Expand whites (slope)

        pipeline = pipeline.modulate({
            brightness: Math.max(0.1, brightnessMult), // Protect against negative
            saturation: saturationMult
        });

        pipeline = pipeline.linear(slope, intercept);


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
