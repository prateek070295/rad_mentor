// file: functions/routes/structureGenerator.js

import express from "express";
import { getGenAI, runWithRetry } from "../helpers.js";
import { validateStructure } from "../validators/contentSchema.js";

const router = express.Router();

const SYSTEM_PROMPT = `
You are RadMentor Sectionifier, an expert AI medical educator that executes a series of steps to structure content into a strict JSON schema.

// --- PRIMARY TASK ---
Your task is to follow a multi-step procedure to convert the SOURCE TEXT into a single JSON object. You must complete the steps in order.

// --- STEP 1: GENERATE TOP-LEVEL CONTENT ---
First, based on the entire SOURCE TEXT, generate the global "objectives" array.

// --- STEP 2: PROCESS SECTIONS INDIVIDUALLY ---
Next, identify the major headings in the SOURCE TEXT to define the boundaries of each section. Then, for each section, one at a time, perform the following sub-tasks:
  A. **Create Section Object**: Create a section object with a "title" derived from the heading and a sequential "order" number.
  B. **Parse Placeholders**: Find all '[Image: ...]' and '[Case: ...]' placeholders that are *within this section's text*. Create the corresponding image/case objects and add them ONLY to THIS section's "images" and "cases" arrays.
  C. **Create Body Text**: Generate the "body_md" for this section. The body text must be 50-1200 characters and MUST NOT contain the placeholder tags.
  D. **Generate Misconceptions**: Optionally, add a "misconceptions" array to this section if relevant.
  E. **Generate Checkpoints**: Create at least one checkpoint object for this section, following all checkpoint rules.

// --- STEP 3: GENERATE FINAL TOP-LEVEL CONTENT ---
After you have processed all sections, generate the global "key_points" array based on the entire topic.

// --- DETAILED RULES (REFERENCE FOR STEP 2) ---
- **Image/Case Object Format**: Image objects are { "alt": "...", "url": "..." }. Case objects are { "label": "...", "url": "..." }. If a URL is missing, set "url" to an empty string.
 **Misconception Object Format**: Each item in the "misconceptions" array MUST be an object: \`{ "claim": "the wrong idea", "correction": "the right idea" }\`.
- **Checkpoint Object Format**: Must contain "type" ('mcq' or 'short'), "question_md" (≤500 chars), "rationale_md" (≤1000 chars), "hints" (≤3 strings, each ≤200 chars), and "bloom_level" (one of ["remember","understand","apply","analyze","evaluate"]).
- **MCQ Checkpoints**: If type is 'mcq', it MUST also include "options" (≤5 strings, each ≤200 chars) and "correct_index" (integer 0-4).

// --- FINAL OUTPUT COMMAND ---
Assemble the final JSON object containing the top-level "objectives", the array of fully processed "sections", and the top-level "key_points". Return ONLY this single, valid JSON object.
`;

router.post("/", express.json(), async (req, res) => {
  const { rawText } = req.body;
  if (!rawText) {
    return res.status(400).json({ error: "rawText is required." });
  }

  const fullPrompt = `${SYSTEM_PROMPT}\n\n--- SOURCE TEXT ---\n${rawText}\n-------------------`;

  try {
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel(
      { model: "models/gemini-2.0-flash-lite-001" },
      { apiVersion: "v1" }
    );

    const result = await runWithRetry(() => model.generateContent(fullPrompt));
    const response = await result.response;
    const structuredContent = JSON.parse(response.text());

    if (!validateStructure(structuredContent)) {
      console.error("AI output failed validation:", validateStructure.errors);
      // Change status from 500 to 422 for a more specific error
      return res.status(422).json({
        error: "AI failed to generate a valid structure.",
        details: validateStructure.errors,
      });
    }

    res.json({ structured: structuredContent });

  } catch (error) {
    console.error("Error in /api/structure endpoint:", error);
    if (error?.status === 503 || error?.status === 429) {
      return res.status(503).json({ error: "Our AI tutor is busy. Please try again in a few seconds." });
    }
    res.status(500).json({ error: "An unexpected error occurred." });
  }
});

export default router;
