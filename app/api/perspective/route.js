import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export async function POST(req) {
    try {
        const { imagePath, settings } = await req.json();

        if (!imagePath) {
            return NextResponse.json({ success: false, error: 'No image path provided' }, { status: 400 });
        }

        // Resolve absolute path (Strip query params first)
        const cleanPath = imagePath.split('?')[0];
        const userDataPath = process.env.USER_DATA_PATH;
        let absoluteInputPath;

        if (userDataPath) {
            // If using external data path, strip /api/media/
            const relativePath = cleanPath.replace('/api/media/', '');
            absoluteInputPath = path.join(userDataPath, relativePath);
        } else {
            // Local public folder
            // If path contains /api/media/, strip it to map to public/
            // But usually publicUrlPrefix was used which maps to /uploads or /primary directly in public
            // If the path comes in as /api/media/primary/..., we need to strip /api/media/ and prepend 'public'
            // However, locally we might just have /primary/...

            let relativePath = cleanPath;
            if (relativePath.startsWith('/api/media/')) {
                relativePath = relativePath.replace('/api/media/', '');
            } else if (relativePath.startsWith('/')) {
                relativePath = relativePath.slice(1);
            }
            absoluteInputPath = path.join(process.cwd(), 'public', relativePath);
        }

        console.log('[Perspective] Resolving:', cleanPath, '->', absoluteInputPath);

        if (!fs.existsSync(absoluteInputPath)) {
            // Try fallback if strictly relative to public was passed without prefix handling
            const fallbackPath = path.join(process.cwd(), 'public', cleanPath.replace(/^\//, ''));
            if (fs.existsSync(fallbackPath)) {
                absoluteInputPath = fallbackPath;
            } else {
                return NextResponse.json({ success: false, error: `File not found: ${absoluteInputPath}` }, { status: 404 });
            }
        }

        const fileName = path.basename(absoluteInputPath);
        // Force PNG extension for transparency
        const nameWithoutExt = path.parse(fileName).name;
        // In-Place Replacement: Same directory, same name (forced .png)
        const outputFileName = `${nameWithoutExt}.png`;
        const outputDir = path.dirname(absoluteInputPath); // Same as input

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const absoluteOutputPath = path.join(outputDir, outputFileName);
        const scriptPath = path.join(process.cwd(), 'scripts', 'perspective_fix.py');
        // settings already includes rotation if passed from frontend
        const settingsJson = JSON.stringify(settings || {});

        // Run Python script
        return new Promise((resolve) => {
            const pythonProcess = spawn('python3', [scriptPath, absoluteInputPath, absoluteOutputPath, settingsJson]);

            let stdout = '';
            let stderr = '';

            pythonProcess.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            pythonProcess.on('close', (code) => {
                if (code === 0) {
                    // Check if we need to cleanup the original file (if extension changed e.g. jpg -> png)
                    if (absoluteInputPath !== absoluteOutputPath) {
                        try {
                            fs.unlinkSync(absoluteInputPath);
                            console.log('Replaced original file:', absoluteInputPath);
                        } catch (err) {
                            console.warn('Failed to delete original file:', err);
                        }
                    }

                    // Constuct public path (replace physical path with URL path)
                    // We can assume standard structure /primary/ or /processed/
                    // Simplest is to derive from input cleanPath
                    const dirUrl = path.dirname(cleanPath);
                    const newUrlPath = `${dirUrl}/${outputFileName}`;

                    resolve(NextResponse.json({
                        success: true,
                        straightenedPath: newUrlPath,
                        message: stdout.trim()
                    }));
                } else {
                    console.error('Python Error:', stderr);
                    resolve(NextResponse.json({
                        success: false,
                        error: 'Perspective correction failed',
                        details: stderr
                    }, { status: 500 }));
                }
            });
        });

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
