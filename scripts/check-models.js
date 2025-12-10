const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config({ path: '.env.local' });

async function checkModels() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    console.log("Checking model availability (v1 API)...");

    // Check Gemini 1.5 Pro (v1 - no apiVersion specified)
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
        const result = await model.generateContent("Hello");
        console.log("✅ gemini-1.5-pro (v1) WORKS");
    } catch (e) {
        console.error("❌ gemini-1.5-pro (v1) FAILED:", e.message);
    }

    // Check Gemini 1.5 Flash (v1)
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent("Hello");
        console.log("✅ gemini-1.5-flash (v1) WORKS");
    } catch (e) {
        console.error("❌ gemini-1.5-flash (v1) FAILED:", e.message);
    }

    // Check Gemini Pro (v1)
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const result = await model.generateContent("Hello");
        console.log("✅ gemini-pro (v1) WORKS");
    } catch (e) {
        console.error("❌ gemini-pro (v1) FAILED:", e.message);
    }
}

checkModels();
