import { GoogleGenerativeAI } from "@google/generative-ai";

(async () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error("GEMINI_API_KEY not set");
    process.exit(1);
  }

  const genAI = new GoogleGenerativeAI(key);
  console.log("Checking for available models...");
  try {
    const models = await genAI.listModels();
    for await (const model of models) {
      if (Array.isArray(model.supportedGenerationMethods) && model.supportedGenerationMethods.includes("generateContent")) {
        console.log(model.name);
      }
    }
  } catch (error) {
    console.error("Error listing models:", error);
    process.exit(1);
  }
})();
