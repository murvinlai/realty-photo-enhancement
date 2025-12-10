import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(request) {
    try {
        const formData = await request.formData();
        const files = formData.getAll('files');

        if (!files || files.length === 0) {
            return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
        }

        const uploadDir = path.join(process.cwd(), 'public/uploads');
        // Ensure directory exists (redundant but safe)
        await mkdir(uploadDir, { recursive: true });

        const savedFiles = [];

        for (const file of files) {
            const buffer = Buffer.from(await file.arrayBuffer());
            // Sanitize filename or generate unique ID
            const filename = `${Date.now()}-${file.name.replace(/\s+/g, '_')}`;
            const filepath = path.join(uploadDir, filename);

            await writeFile(filepath, buffer);

            savedFiles.push({
                originalName: file.name,
                filename: filename,
                path: `/uploads/${filename}`,
                absolutePath: filepath
            });
        }

        return NextResponse.json({ success: true, files: savedFiles });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}
