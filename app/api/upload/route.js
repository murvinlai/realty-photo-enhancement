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
        let uploadDir;
        let publicUrlPrefix;

        if (userDataPath) {
            uploadDir = sessionId ? path.join(userDataPath, 'uploads', sessionId) : path.join(userDataPath, 'uploads');
            publicUrlPrefix = sessionId ? `/api/media/uploads/${sessionId}` : '/api/media/uploads';
        } else {
            uploadDir = sessionId ? path.join(process.cwd(), 'public/uploads', sessionId) : path.join(process.cwd(), 'public/uploads');
            publicUrlPrefix = sessionId ? `/uploads/${sessionId}` : '/uploads';
        }

        // Ensure directory exists
        await mkdir(uploadDir, { recursive: true });

        const savedFiles = [];

        for (const file of files) {
            let buffer = Buffer.from(await file.arrayBuffer());
            let filename = file.name.replace(/\s+/g, '_');
            const ext = path.extname(filename).toLowerCase();

            // HEIC/HEIF Detection (Extension or Content)
            let isHeic = ext === '.heic' || ext === '.heif';

            // If extension doesn't match, check actual metadata using Sharp
            if (!isHeic) {
                try {
                    const metadata = await sharp(buffer).metadata();
                    if (metadata.format === 'heif' || metadata.format === 'heic') {
                        isHeic = true;
                        console.log(`Detected HEIC disguised as ${ext}: ${filename}`);
                    }
                } catch (e) {
                    console.warn('Failed to probe image metadata:', e);
                }
            }

            if (isHeic) {
                try {
                    console.log(`Converting HEIC: ${filename}`);
                    buffer = await sharp(buffer)
                        .jpeg({ quality: 90 })
                        .toBuffer();

                    // Update filename to .jpg
                    filename = filename.substring(0, filename.lastIndexOf('.')) + '.jpg';
                    console.log(`Converted to: ${filename}`);
                } catch (conversionError) {
                    console.error('HEIC conversion failed:', conversionError);
                }
            }

            // Generate unique filename (Session isolation handles conflicts now)
            // Use original filename (sanitized)
            const uniqueFilename = filename;
            const filepath = path.join(uploadDir, uniqueFilename);

            await writeFile(filepath, buffer);

            savedFiles.push({
                originalName: file.name,
                filename: uniqueFilename,
                path: `${publicUrlPrefix}/${uniqueFilename}`,
                absolutePath: filepath
            });
        }

        return NextResponse.json({ success: true, files: savedFiles });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}
