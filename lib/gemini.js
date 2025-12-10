import { GoogleGenAI } from "@google/genai";

// Initialize the new Gen AI SDK Client
// We export the client itself, as model instantiation happens at call time with the new SDK patterns
export const genaiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });


