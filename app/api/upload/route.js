import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

export async function POST(request) {
    try {
        const formData = await request.formData();
        const files = formData.getAll('files');
        const sessionId = formData.get('sessionId');

        if (!files || files.length === 0) {
            return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
        }

        // Determine Storage Path
        const userDataPath = process.env.USER_DATA_PATH;
        let uploadDir; // Source (Untouched)
        let primaryDir; // Primary (Working Copy)
        let publicUrlPrefix; // Points to Primary

        if (userDataPath) {
            uploadDir = sessionId ? path.join(userDataPath, 'uploads', sessionId) : path.join(userDataPath, 'uploads');
            primaryDir = sessionId ? path.join(userDataPath, 'primary', sessionId) : path.join(userDataPath, 'primary');
            publicUrlPrefix = sessionId ? `/api/media/primary/${sessionId}` : '/api/media/primary';
        } else {
            uploadDir = sessionId ? path.join(process.cwd(), 'public/uploads', sessionId) : path.join(process.cwd(), 'public/uploads');
            primaryDir = sessionId ? path.join(process.cwd(), 'public/primary', sessionId) : path.join(process.cwd(), 'public/primary');
            // Ensure Primary URL matches the physical path structure
            publicUrlPrefix = sessionId ? `/primary/${sessionId}` : '/primary';
        }

        // Ensure directories exist
        await mkdir(uploadDir, { recursive: true });
        await mkdir(primaryDir, { recursive: true });

        const savedFiles = [];

        for (const file of files) {
            let buffer = Buffer.from(await file.arrayBuffer());
            const rawBuffer = Buffer.from(buffer); // Keep raw for Source

            let filename = file.name.replace(/\s+/g, '_');
            const ext = path.extname(filename).toLowerCase();

            // HEIC/HEIF Detection
            let isHeic = ext === '.heic' || ext === '.heif';

            // Conversion Logic (For Primary Copy ONLY)
            if (isHeic) {
                try {
                    console.log(`[Upload] Converting HEIC to JPEG: ${filename}`);
                    // Attempt 1: With rotation (preserves EXIF orientation)
                    buffer = await sharp(buffer)
                        .rotate()
                        .jpeg({ quality: 90 })
                        .toBuffer();
                    console.log(`[Upload] Primary conversion successful: ${filename}`);
                } catch (primaryError) {
                    console.warn('[Upload] Primary HEIC conversion failed (rotate blocked?), trying fallback:', primaryError.message);
                    try {
                        // Attempt 2: Simple conversion without rotation
                        buffer = await sharp(buffer)
                            .jpeg({ quality: 90 })
                            .toBuffer();
                        console.log(`[Upload] Fallback conversion successful: ${filename}`);
                    } catch (fallbackError) {
                        console.error('[Upload] HEIC conversion CRITICAL failure:', fallbackError);
                        throw new Error(`HEIC Conversion Failed: ${fallbackError.message}`);
                    }
                }

                // Update filename to .jpg
                const baseName = filename.substring(0, filename.lastIndexOf('.')) || filename;
                filename = `${baseName}.jpg`;
            } else {
                // For non-HEIC, we still want to ensure they are browser-compatible and rotated
                try {
                    const metadata = await sharp(buffer).metadata();
                    // Optional: If it's a very large image or needs rotation
                    if (metadata.orientation || metadata.width > 4000) {
                        buffer = await sharp(buffer).rotate().toBuffer();
                    }
                } catch (e) {
                    console.warn(`[Upload] Rotation/Metadata check skipped for ${filename}:`, e.message);
                }
            }

            // Generate unique filename (Session isolation handles conflicts now)
            // Use original filename (sanitized)
            const uniqueFilename = filename;

            // 1. Save Source (Untouched - except Raw upload)
            const sourcePath = path.join(uploadDir, file.name.replace(/\s+/g, '_')); // Authentically Original name
            await writeFile(sourcePath, rawBuffer);

            // 2. Save Primary (Working Copy - Converted/Rotated)
            const primaryPath = path.join(primaryDir, uniqueFilename);
            await writeFile(primaryPath, buffer);

            savedFiles.push({
                originalName: file.name,
                filename: uniqueFilename,
                path: `${publicUrlPrefix}/${uniqueFilename}`, // Frontend uses this Primary path
                absolutePath: primaryPath,
                sourcePath: sourcePath // Metadata only, not used by frontend by default
            });
        }

        return NextResponse.json({ success: true, files: savedFiles });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
    }
}
