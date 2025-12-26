
import { NextResponse } from 'next/server';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const imagePath = searchParams.get('path');
    const format = searchParams.get('format') || 'jpg';
    const width = searchParams.get('width');
    const quality = parseInt(searchParams.get('quality') || '90');

    if (!imagePath) {
        return NextResponse.json({ error: 'Image path is required' }, { status: 400 });
    }

    // Environment-aware path resolution
    const userDataPath = process.env.USER_DATA_PATH;
    let absolutePath;

    if (userDataPath) {
        // Production/Electron logic
        if (imagePath.startsWith('/api/media/')) {
            const relativePath = imagePath.replace('/api/media/', '');
            absolutePath = path.join(userDataPath, relativePath);
        } else {
            // Handle cases where the path might be /uploads/... or /processed/...
            // Strip leading slash for join if needed, but path.join handles it
            absolutePath = path.join(userDataPath, imagePath.startsWith('/') ? imagePath.slice(1) : imagePath);
        }
    } else {
        // Dev/Standard logic: Resolve via public/
        // If it's already absolute (on the system), use it (legacy/fallback)
        if (path.isAbsolute(imagePath) && !imagePath.startsWith('/processed') && !imagePath.startsWith('/uploads')) {
            absolutePath = imagePath;
        } else {
            const relativePath = imagePath.startsWith('/') ? imagePath.slice(1) : imagePath;
            absolutePath = path.join(process.cwd(), 'public', relativePath);
        }
    }

    try {
        // Read the file
        let imageBuffer = await fs.readFile(absolutePath);
        let pipeline = sharp(imageBuffer);

        // Resize if width is provided
        if (width) {
            const widthInt = parseInt(width);
            if (!isNaN(widthInt) && widthInt > 0) {
                pipeline = pipeline.resize({ width: widthInt, withoutEnlargement: true });
            }
        }

        // Format conversion
        const validFormats = ['jpg', 'jpeg', 'png', 'webp'];
        const targetFormat = validFormats.includes(format.toLowerCase()) ? format.toLowerCase() : 'jpg';

        if (targetFormat === 'jpg' || targetFormat === 'jpeg') {
            pipeline = pipeline.jpeg({ quality, mozjpeg: true });
        } else if (targetFormat === 'png') {
            pipeline = pipeline.png({ quality: Math.min(quality, 100) }); // PNG quality is different logic usually, but sharp handles it
        } else if (targetFormat === 'webp') {
            pipeline = pipeline.webp({ quality });
        }

        const buffer = await pipeline.toBuffer();

        // Extract filename
        const originalName = path.basename(absolutePath, path.extname(absolutePath));
        const filename = `${originalName}_${width ? width + 'px' : 'original'}.${targetFormat === 'jpeg' ? 'jpg' : targetFormat}`;

        // Return as stream
        return new NextResponse(buffer, {
            headers: {
                'Content-Type': `image/${targetFormat === 'jpg' ? 'jpeg' : targetFormat}`,
                'Content-Disposition': `attachment; filename="${filename}"`
            }
        });

    } catch (error) {
        console.error('Download API Error:', error);
        return NextResponse.json({ error: 'Failed to process image' }, { status: 500 });
    }
}
