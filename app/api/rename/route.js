import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request) {
    try {
        const { imagePath, newName } = await request.json();

        if (!imagePath || !newName) {
            return NextResponse.json({ error: 'Missing imagePath or newName' }, { status: 400 });
        }

        // Resolve absolute path (Reusing logic from enhance/route.js ideally, but simplifying for now)
        // We assume imagePath is either absolute (from Electron) or relative public path
        let absoluteOldPath;
        const userDataPath = process.env.USER_DATA_PATH;

        // Clean path
        const cleanPath = imagePath.split('?')[0];

        if (userDataPath) {
            if (cleanPath.startsWith('/api/media/')) {
                absoluteOldPath = path.join(userDataPath, cleanPath.replace('/api/media/', ''));
            } else {
                absoluteOldPath = path.join(userDataPath, cleanPath);
            }
        } else {
            // Dev/Public
            absoluteOldPath = path.join(process.cwd(), 'public', cleanPath);
        }

        // Verify old file exists
        try {
            await fs.access(absoluteOldPath);
        } catch (e) {
            return NextResponse.json({ error: 'Source file not found' }, { status: 404 });
        }

        const dir = path.dirname(absoluteOldPath);
        const ext = path.extname(newName) || path.extname(absoluteOldPath);
        let baseName = path.basename(newName, ext);

        // Smart Collision Detection
        let finalName = `${baseName}${ext}`;
        let finalPath = path.join(dir, finalName);
        let counter = 1;

        while (true) {
            try {
                // Check if file exists
                await fs.access(finalPath);
                // If we are here, it exists. Try next counter.
                finalName = `${baseName} (${counter})${ext}`;
                finalPath = path.join(dir, finalName);
                counter++;
            } catch (e) {
                // If error is ENOENT, file does not exist. We are good.
                if (e.code === 'ENOENT') {
                    break;
                }
                // Other error? Cancel.
                throw e;
            }
        }

        // Rename
        await fs.rename(absoluteOldPath, finalPath);

        // Construct public path for frontend
        let publicPath;
        if (userDataPath) {
            // Reconstruct /api/media path
            // absolute path -> relative to userDataPath
            const rel = path.relative(userDataPath, finalPath);
            publicPath = `/api/media/${rel}`;
        } else {
            // public/processed...
            const rel = path.relative(path.join(process.cwd(), 'public'), finalPath);
            publicPath = `/${rel}`;
        }

        // Ensure standard separators for URL
        publicPath = publicPath.split(path.sep).join('/');
        if (!publicPath.startsWith('/')) publicPath = '/' + publicPath;

        return NextResponse.json({
            success: true,
            originalName: newName, // The requested name
            finalName: finalName, // The actual name on disk
            path: publicPath
        });

    } catch (error) {
        console.error('Rename API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
