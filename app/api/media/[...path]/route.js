import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import mime from 'mime'; // You might need to add this dependency or write a simple lookup

export async function GET(request, { params }) {
    try {
        // Await params in Next.js 15+ compatible way if needed, but standard for now
        // Note: params is a promise in newer Next.js versions, but let's assume standard behavior or await it if unsure.
        // Safest is to await it just in case.
        const resolvedParams = await params;
        const filePathParam = resolvedParams.path;

        // This route is intended to serve files from the App Data directory in production
        // In local dev, if USER_DATA_PATH is not set, this route might return 404 
        // unless we define a fallback (e.g. invalid usage).

        const userDataPath = process.env.USER_DATA_PATH;

        if (!userDataPath) {
            return NextResponse.json({ error: 'Media service not available in this environment' }, { status: 404 });
        }

        // Construct absolute path
        // filePathParam is an array like ['uploads', 'filename.jpg']
        const fullPath = path.join(userDataPath, ...filePathParam);

        // Security check: Ensure we are still within userDataPath
        if (!fullPath.startsWith(userDataPath)) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        try {
            const fileBuffer = await readFile(fullPath);

            // Determine mime type
            // fallback to basic types if mime package not available, but 'path.extname' is easy
            const ext = path.extname(fullPath).toLowerCase();
            let contentType = 'application/octet-stream';
            if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
            else if (ext === '.png') contentType = 'image/png';
            else if (ext === '.webp') contentType = 'image/webp';
            else if (ext === '.gif') contentType = 'image/gif';

            return new NextResponse(fileBuffer, {
                headers: {
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=31536000, immutable'
                }
            });

        } catch (fileError) {
            console.error('File read error:', fileError);
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
        }

    } catch (error) {
        console.error('Media API Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
