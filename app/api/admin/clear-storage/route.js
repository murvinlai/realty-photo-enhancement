import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST() {
    try {
        const publicDir = path.join(process.cwd(), 'public');
        const dirsToClear = ['uploads', 'processed'];
        const results = [];

        for (const dirName of dirsToClear) {
            const dirPath = path.join(publicDir, dirName);

            try {
                // Check if directory exists
                await fs.access(dirPath);

                // Read directory contents
                const files = await fs.readdir(dirPath);

                // Delete each file/directory inside
                for (const file of files) {
                    const filePath = path.join(dirPath, file);
                    await fs.rm(filePath, { recursive: true, force: true });
                }

                results.push({ dir: dirName, status: 'cleared', count: files.length });
            } catch (err) {
                if (err.code === 'ENOENT') {
                    results.push({ dir: dirName, status: 'missing' });
                } else {
                    throw err;
                }
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Storage cleared successfully',
            details: results
        });
    } catch (error) {
        console.error('Clear storage error:', error);
        return NextResponse.json({
            success: false,
            error: error.message || 'Failed to clear storage'
        }, { status: 500 });
    }
}
