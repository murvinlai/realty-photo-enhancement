const { GoogleGenAI } = require("@google/genai");
const fs = require('fs/promises');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const genaiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function testGeminiEditing() {
    const inputImageName = "ext 20251201_133513_ExteriorFront.jpg";
    const inputPath = path.join(process.cwd(), 'test', inputImageName);
    const instructions = "Replace sky with blue sky with fluffy clouds";
    const outputPath = path.join(process.cwd(), 'test', `enhanced-${Date.now()}.png`);

    console.log(`--- Testing Gemini 3 Image Edits ---`);
    console.log(`Input: ${inputPath}`);
    console.log(`Prompt: ${instructions}`);

    try {
        // Read Image
        const imageBuffer = await fs.readFile(inputPath);
        const imageBase64 = imageBuffer.toString('base64');

        // Call API
        console.log("Sending request to 'gemini-3-pro-image-preview'...");
        const response = await genaiClient.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: instructions },
                        {
                            inlineData: {
                                mimeType: 'image/jpeg',
                                data: imageBase64
                            }
                        }
                    ]
                }
            ],
            config: {
                responseModalities: ['IMAGE'],
                imageConfig: {
                    aspectRatio: "16:9",
                    imageSize: "4k"
                }
            }
        });

        // Save Output
        const candidate = response.candidates?.[0];
        if (candidate?.content?.parts?.[0]?.inlineData?.data) {
            const buffer = Buffer.from(candidate.content.parts[0].inlineData.data, 'base64');
            await fs.writeFile(outputPath, buffer);
            console.log(`[SUCCESS] Image saved to: ${outputPath}`);
            return true;
        } else {
            console.error("[FAILED] No image data in response:", JSON.stringify(response, null, 2));
            return false;
        }

    } catch (error) {
        console.error("[ERROR]", error.message);
        if (error.response) {
            console.error("Response Details:", JSON.stringify(error.response, null, 2));
        }
        return false;
    }
}

testGeminiEditing();
