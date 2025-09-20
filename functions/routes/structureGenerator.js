// file: functions/routes/structureGenerator.js

import express from "express";
import { getGenAI } from "../helpers.js";
import { validateStructure } from "../validators/contentSchema.js";

const router = express.Router();

const SYSTEM_PROMPT = `You are RadMentor Sectionifier, an AI assistant that structures radiology textbook content.

TASK:
Convert the user's 'SOURCE TEXT' into a structured JSON format.

RULES:
1.  **SECTION STRUCTURE**: Every section object MUST have "title", "order" (integer starting at 1), and "body_md".
2.  **CHECKPOINTS**: Each section MUST have at least one checkpoint object. Each checkpoint MUST include "type" (must be 'mcq' or 'short'), "question_md", "rationale_md", "hints", and "bloom_level" (one of: "remember", "understand", "apply", "analyze", "evaluate").
3.  **MCQ REQUIREMENTS**: If a checkpoint's type is 'mcq', it MUST also include an "options" array with 3-4 plausible text options, and a "correct_index" (integer, 0-based) indicating the correct option.
4.  **HINTS**: Each checkpoint must include 1 to 3 escalating hints that guide the user to the answer without giving it away.
5.  **RATIONALE**: Each checkpoint must have a clear, concise rationale that explains the correct answer.
6.  **IMAGE PARSING**: The user may provide image placeholders like '[Image: description text]' or '[Image: description text,https://...url...]'. You MUST parse these. Create an image object in the section's 'images' array with an 'alt' property. If a URL is provided, include it; otherwise, set the 'url' property to an empty string ("").
7.  **CLEAN BODY TEXT**: The final 'body_md' text in your output should NOT include the '[Image: ...]' tags themselves.
8.  **OUTPUT**: Return ONLY valid JSON that passes the provided schema.`;

router.post("/", express.json(), async (req, res) => {
  const { rawText } = req.body;
  if (!rawText) {
    return res.status(400).json({ error: "rawText is required." });
  }

  const fullPrompt = `${SYSTEM_PROMPT}\n\n--- SOURCE TEXT ---\n${rawText}\n-------------------`;

  try {
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-latest",
      generationConfig: { responseMimeType: "application/json" },
    });

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const structuredContent = JSON.parse(response.text());

    if (!validateStructure(structuredContent)) {
      console.error("AI output failed validation:", validateStructure.errors);
      return res.status(500).json({
        error: "AI failed to generate a valid structure.",
        details: validateStructure.errors,
      });
    }

    res.json({ structured: structuredContent });

  } catch (error) {
    console.error("Error in /api/structure endpoint:", error);
    res.status(500).json({ error: "An unexpected error occurred." });
  }
});

export default router;