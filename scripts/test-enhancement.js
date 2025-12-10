const fs = require('fs');
const path = require('path');
const { FormData } = require('formidable');

// Polyfill for fetch and FormData in older Node versions if needed, 
// but in modern Node (v18+) fetch is native. 
// We might need 'form-data' package for file uploads if standard fetch/FormData behaves oddly in node.
// Let's try to use standard native fetch and see.

async function runTest() {
    const images = [
        'ext 20251201_133513_ExteriorFront.jpg',
        'ext DJI_20251204_123740_091_ExteriorFront.jpeg'
    ];

    const testDir = path.join(__dirname, '../test');

    console.log('--- Starting Integration Test ---');

    for (const imageName of images) {
        console.log(`\nTesting image: ${imageName}`);
        const filePath = path.join(testDir, imageName);

        if (!fs.existsSync(filePath)) {
            console.error(`File not found: ${filePath}`);
            continue;
        }

        // 1. Upload
        console.log('Step 1: Uploading...');

        // In Node.js, sending FormData with fetch requires a bit of work or 'undici'
        // We'll simulate the upload by just copying the file to public/uploads manually for this test
        // to isolate the "Enhance" logic which is the critical part, 
        // OR we do a real POST. Real POST is better for "Unit Testing" the server.
        // Let's use the 'form-data' library approach if available, but since we didn't install it,
        // let's try a simpler approach: Just read the file and skip the upload endpoint if it's too complex to mock 
        // without multiple dependencies. 

        // actually, let's try to just Use the API.
        // We need to construct a multipart request.

        // SIMPLIFICATION: To verify the *Enhancement* logic specifically:
        // We can just manually copy the file to 'public/uploads' and then call the enhance API.
        // This avoids needing 'form-data' or complex fetch mocking for multipart.

        const uploadDir = path.join(__dirname, '../public/uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        const uploadedFilename = `test-${Date.now()}-${imageName.replace(/\s+/g, '_')}`;
        const uploadedPath = path.join(uploadDir, uploadedFilename);
        const publicPath = `/uploads/${uploadedFilename}`;

        fs.copyFileSync(filePath, uploadedPath);
        console.log(`Simulated upload to: ${publicPath}`);

        // 2. Enhance
        console.log('Step 2: Enhancing...');
        try {
            const response = await fetch('http://localhost:3000/api/enhance', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    imagePath: publicPath,
                    instructions: "Make the sky bluer and increase contrast."
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                console.log('✅ Enhancement Success!');
                console.log('Output:', data.enhancedPath);

                // Verify file exists
                const localOutputPath = path.join(__dirname, '../public', data.enhancedPath);
                if (fs.existsSync(localOutputPath)) {
                    console.log('✅ Output file verified on disk.');
                } else {
                    console.error('❌ Output file missing on disk.');
                }

            } else {
                console.error('❌ Enhancement Failed:', data);
            }

        } catch (error) {
            console.error('❌ Network or Server Error during enhance:', error.message);
        }
    }
}

runTest();
