import { NextResponse } from 'next/server';
import { genaiClient } from '@/lib/gemini';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

export async function POST(request) {
    try {
        const { imagePath, instructions, sessionId, suffix, originalName } = await request.json();


        if (!process.env.GEMINI_API_KEY) {
            console.error('Missing GEMINI_API_KEY');
            return NextResponse.json({ error: 'Server Configuration Error: Missing API Key' }, { status: 500 });
        }

        if (!imagePath || !instructions) {
            return NextResponse.json({ error: 'Missing imagePath or instructions' }, { status: 400 });
        }

        // Clean query params (e.g., ?t=timestamp) from the path
        const cleanPath = imagePath.split('?')[0];

        const filename = path.basename(cleanPath);
        const ext = path.extname(filename);

        let nameWithoutExt = path.basename(filename, ext);
        if (originalName) {
            // Use original name if provided to avoid stacking prefixes/suffixes (e.g. enhanced-enhanced-...)
            nameWithoutExt = path.parse(originalName).name;
        }

        // Use suffix if provided (e.g. -result-1), otherwise default to enhanced- prefix
        const outputFilename = suffix ? `${nameWithoutExt}${suffix}.png` : `enhanced-${nameWithoutExt}.png`;

        // Handle path resolution based on environment
        const userDataPath = process.env.USER_DATA_PATH;
        let absoluteInputPath;
        let absoluteOutputPath;
        let publicOutputPath;

        if (userDataPath) {
            // Production/Electron: Use USER_DATA_PATH
            // imagePath comes in like "/api/media/uploads/file.jpg" or "/uploads/file.jpg"
            // We need to resolve this back to the absolute path

            // Basic logic: if it starts with /api/media/, strip it and join with userDataPath
            if (cleanPath.startsWith('/api/media/')) {
                const relativePath = cleanPath.replace('/api/media/', '');
                absoluteInputPath = path.join(userDataPath, relativePath);
            } else if (cleanPath.startsWith('/uploads')) {
                // Legacy or fallback
                absoluteInputPath = path.join(userDataPath, cleanPath);
            } else {
                // Fallback to public if logic fails (unsafe in prod but...)
                absoluteInputPath = path.join(process.cwd(), 'public', cleanPath);
            }

            // Output Config
            const processedDir = sessionId ? path.join(userDataPath, 'processed', sessionId) : path.join(userDataPath, 'processed');
            // Ensure processed dir exists - we must do this as we can't assume it exists
            const { mkdir } = require('fs/promises');
            await mkdir(processedDir, { recursive: true });

            absoluteOutputPath = path.join(processedDir, outputFilename);
            publicOutputPath = sessionId ? `/api/media/processed/${sessionId}/${outputFilename}` : `/api/media/processed/${outputFilename}`;

        } else {
            // Dev/Standard: Use public/
            absoluteInputPath = path.join(process.cwd(), 'public', cleanPath);

            const processedDir = sessionId ? path.join(process.cwd(), 'public/processed', sessionId) : path.join(process.cwd(), 'public/processed');
            // Ensure local dev processed dir exists too
            const { mkdir } = require('fs/promises');
            await mkdir(processedDir, { recursive: true });

            absoluteOutputPath = path.join(processedDir, outputFilename);
            publicOutputPath = sessionId ? `/processed/${sessionId}/${outputFilename}` : `/processed/${outputFilename}`;
        }

        // 1. Read input image
        console.time('ReadInput');
        const imageBuffer = await readFile(absoluteInputPath);
        console.timeEnd('ReadInput');
        const imageBase64 = imageBuffer.toString('base64');

        // Log input dimensions to debug resolution issues
        let targetAspectRatio = "16:9"; // Default
        try {
            const metadata = await sharp(imageBuffer).metadata();
            console.log(`[Enhance] Input Dimensions: ${metadata.width}x${metadata.height}`);

            const ratio = metadata.width / metadata.height;
            // More precise buckets including 3:2 (1.5)
            if (ratio >= 1.7) targetAspectRatio = "16:9";      // ~1.77
            else if (ratio >= 1.45) targetAspectRatio = "3:2"; // ~1.5
            else if (ratio >= 1.25) targetAspectRatio = "4:3"; // ~1.33
            else if (ratio >= 0.9) targetAspectRatio = "1:1";  // ~1.0
            else if (ratio >= 0.7) targetAspectRatio = "3:4";  // ~0.75
            else if (ratio >= 0.6) targetAspectRatio = "2:3";  // ~0.66
            else targetAspectRatio = "9:16";                   // ~0.56

            console.log(`[Enhance] Calculated Target Ratio: ${targetAspectRatio}`);

        } catch (e) {
            console.log('[Enhance] Could not read input dimensions, defaulting to 16:9');
        }

        // 2. Call Gemini 3 Pro for Image Editing
        console.log(`[Gemini 3] Processing: ${filename}`);
        console.time('GeminiRequest');

        const response = await genaiClient.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: `Edit this image. Instructions: ${instructions}. Maintain photorealism. High quality real estate photography.` },
                        {
                            inlineData: {
                                mimeType: ext === '.png' ? 'image/png' : 'image/jpeg',
                                data: imageBase64
                            }
                        }
                    ]
                }
            ],
            config: {
                responseModalities: ['IMAGE'],
                imageConfig: {
                    aspectRatio: targetAspectRatio,
                    imageSize: "4k"
                }
            }
        });
        console.timeEnd('GeminiRequest');

        // 3. Handle Generated Image Response
        const candidate = response.candidates?.[0];
        if (!candidate || !candidate.content || !candidate.content.parts) {
            throw new Error("No image generated by Gemini 3.");
        }

        let imageSaved = false;

        for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.data) {
                // Save the base64 image data to file
                const buffer = Buffer.from(part.inlineData.data, 'base64');

                // Match Input Dimensions (Upscale/Resize if needed)
                // The user explicitly requested "same dimension and resolution".
                // We use 'cover' (crop) instead of 'fill' (stretch) to avoid distortion.
                let finalBuffer = buffer;
                try {
                    const inputMeta = await sharp(imageBuffer).metadata();
                    const outMeta = await sharp(buffer).metadata();

                    if (inputMeta.width && inputMeta.height) {
                        // Only resize if significantly different ensuring exact pixel match
                        if (inputMeta.width !== outMeta.width || inputMeta.height !== outMeta.height) {
                            console.log(`[Enhance] Restoring dimensions from ${outMeta.width}x${outMeta.height} to ${inputMeta.width}x${inputMeta.height}`);
                            finalBuffer = await sharp(buffer)
                                .resize(inputMeta.width, inputMeta.height, {
                                    fit: 'cover', // PREVENT STRETCHING: Crop excess if ratio is slightly off
                                    position: 'center'
                                })
                                .toBuffer();
                        }
                    }
                } catch (e) {
                    console.error('[Enhance] Resize failed:', e);
                }

                // Final Log
                console.log(`[Enhance] Final Output File Size: ${(finalBuffer.length / 1024 / 1024).toFixed(2)} MB`);

                await writeFile(absoluteOutputPath, finalBuffer);
                imageSaved = true;
                break;
            }
        }

        if (!imageSaved) {
            throw new Error("Gemini response contained no image data.");
        }

        console.log(`[Success] Saved to ${absoluteOutputPath}`);

        return NextResponse.json({
            success: true,
            originalPath: imagePath,
            enhancedPath: publicOutputPath
        });

    } catch (error) {
        console.error('Enhance API (Gemini 3) Error:', error);
        return NextResponse.json({
            error: `AI Enhancement Failed: ${error.message}`,
            details: error.stack
        }, { status: 500 });
    }
}
