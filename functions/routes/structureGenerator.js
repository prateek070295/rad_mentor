// placeholder
// file: functions/routes/structureGenerator.js

import express from "express";
import { getGenAI, runWithRetry } from "../helpers.js";
import { validateStructure } from "../validators/contentSchema.js";

const router = express.Router();

const RESPONSE_SCHEMA = {
  type: "object",
  required: ["objectives", "sections", "key_points"],
  properties: {
    objectives: {
      type: "array",
      maxItems: 5,
      items: { type: "string", maxLength: 600 },
    },
    sections: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["title", "order", "body_md", "checkpoints"],
        properties: {
          title: { type: "string", minLength: 3, maxLength: 100 },
          order: { type: "integer", minimum: 1 },
          body_md: { type: "string", minLength: 50, maxLength: 1200 },
          misconceptions: {
            type: "array",
            maxItems: 3,
            items: {
              type: "object",
              required: ["claim", "correction"],
              properties: {
                claim: { type: "string", maxLength: 600 },
                correction: { type: "string", maxLength: 600 },
              },
            },
          },
          images: {
            type: "array",
            maxItems: 5,
            items: {
              type: "object",
              required: ["alt"],
              properties: {
                alt: { type: "string", maxLength: 300 },
                url: { type: "string" },
              },
            },
          },
          cases: {
            type: "array",
            maxItems: 5,
            items: {
              type: "object",
              required: ["label"],
              properties: {
                label: { type: "string", maxLength: 300 },
                url: { type: "string" },
              },
            },
          },
          checkpoints: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              required: [
                "type",
                "question_md",
                "rationale_md",
                "hints",
                "bloom_level",
              ],
              properties: {
                type: { type: "string", enum: ["mcq", "short"] },
                question_md: { type: "string", maxLength: 500 },
                options: {
                  type: "array",
                  minItems: 4,
                  maxItems: 4,
                  items: { type: "string", maxLength: 300 },
                },
                correct_index: { type: "integer", minimum: 0, maximum: 4 },
                answer_patterns: {
                  type: "array",
                  maxItems: 10,
                  items: { type: "string", maxLength: 300 },
                },
                rationale_md: { type: "string", maxLength: 1000 },
                hints: {
                  type: "array",
                  maxItems: 3,
                  items: { type: "string", maxLength: 300 },
                },
                bloom_level: {
                  type: "string",
                  enum: ["remember", "understand", "apply", "analyze", "evaluate"],
                },
              },
            },
          },
        },
      },
    },
    key_points: {
      type: "array",
      maxItems: 5,
      items: { type: "string", maxLength: 600 },
    },
  },
};

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "in",
  "on",
  "for",
  "to",
  "with",
  "is",
  "are",
  "was",
  "were",
  "be",
  "by",
  "at",
  "as",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
]);

const tokenize = (text) =>
  (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token));

const scoreOptionAgainstRationale = (option, rationaleTokens) => {
  if (!option) return 0;
  const optionTokens = tokenize(option);
  if (!optionTokens.length) return 0;
  const rationaleSet = new Set(rationaleTokens);
  return optionTokens.reduce(
    (score, token) => score + (rationaleSet.has(token) ? 1 : 0),
    0,
  );
};

const sanitizeStructuredContent = (content) => {
  const debugLogs = [];
  if (!content || typeof content !== "object") {
    return { structured: content, debugLogs };
  }

  const clone = JSON.parse(JSON.stringify(content));

  clone.sections = (clone.sections || []).map((section, sectionIndex) => {
    const nextSection = { ...section };

    nextSection.body_md = (nextSection.body_md || "")
      .replace(/\[Image:[^\]]*\]/gi, "")
      .replace(/\[Case:[^\]]*\]/gi, "")
      .replace(/\s+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    nextSection.images = (nextSection.images || []).map((image) => ({
      ...image,
      alt: (image?.alt || "").replace(/\[Image:[^\]]*\]/gi, "").trim(),
    }));

    nextSection.cases = (nextSection.cases || []).map((item) => ({
      ...item,
      label: (item?.label || "").replace(/\[Case:[^\]]*\]/gi, "").trim(),
    }));

    nextSection.checkpoints = (nextSection.checkpoints || []).map((checkpoint, cpIndex) => {
      if (checkpoint?.type !== "mcq") return checkpoint;
      const sanitized = { ...checkpoint };

      const options = Array.isArray(sanitized.options) ? sanitized.options.slice(0, 4) : [];
      while (options.length < 4) options.push("");
      sanitized.options = options.map((option) => option || "");

      const aiIndex = Number.isInteger(sanitized.correct_index)
        ? sanitized.correct_index
        : 0;
      const rationaleTokens = tokenize(sanitized.rationale_md || sanitized.question_md || "");

      let bestIndex = aiIndex;
      if (sanitized.options.length) {
        const scores = sanitized.options.map((option) =>
          scoreOptionAgainstRationale(option, rationaleTokens),
        );
        let bestScore =
          aiIndex >= 0 && aiIndex < sanitized.options.length ? scores[aiIndex] ?? -1 : -1;
        scores.forEach((score, idx) => {
          if (score > bestScore) {
            bestScore = score;
            bestIndex = idx;
          }
        });
        if (bestIndex < 0 || bestIndex >= sanitized.options.length) {
          bestIndex = 0;
        }
      } else {
        bestIndex = 0;
      }

      debugLogs.push({
        sectionOrder: nextSection.order ?? sectionIndex + 1,
        checkpointIndex: cpIndex,
        aiCorrectIndex: aiIndex,
        selectedIndex: bestIndex,
      });

      sanitized.correct_index = bestIndex;
      return sanitized;
    });

    return nextSection;
  });

  return { structured: clone, debugLogs };
};

const SYSTEM_PROMPT = `
You are RadMentor Sectionifier. Your task is to convert SOURCE TEXT into a JSON topic that follows the provided schema.

Core principles:
- Preserve every medically relevant fact from the SOURCE TEXT. Do not omit or invent information.
- Paraphrase everything. Use fresh sentence structure and vocabulary so nothing is copied verbatim.
- Respect the schema constraints: required fields only, string lengths, and array sizes.
- Every rationale must stand on its own, using your own words to justify the correct option and briefly note why the distractors are incorrect.

Schema reference:
- Topic object: includes "objectives" (array of up to 5 strings, each <= 600 chars), "sections" (array with >= 1 item), and "key_points" (array of up to 5 strings, each <= 600 chars).
- Section object: requires "title" (3-100 chars), "order" (integer >= 1), "body_md" (50-1200 chars), and "checkpoints". Optional arrays: "misconceptions" (<= 3 items, each with "claim" and "correction" <= 600 chars), "images" (<= 5 items with "alt" <= 300 chars and optional "url"), and "cases" (<= 5 items with "label" <= 300 chars and optional "url"). Use an empty string for missing URLs.
- Checkpoint object: requires "type" ("mcq" or "short"), "question_md" (<= 500 chars), "rationale_md" (<= 1000 chars), "hints" (array of <= 3 strings, each <= 300 chars; use [] if none), and "bloom_level" (one of "remember", "understand", "apply", "analyze", "evaluate").
- MCQ checkpoints: must also include "options" (exactly 4 strings, each <= 300 chars) and "correct_index" (integer 0-3 that matches the correct option).
- Short-answer checkpoints: may include "answer_patterns" (array of exemplar responses, each <= 300 chars).

Process:
1. Derive the top-level "objectives" that reflect the main learning goals in the SOURCE TEXT.
2. For each major heading:
   - Create a section object with a title and sequential order.
   - Move any [Image: ...] or [Case: ...] placeholders into the appropriate arrays. Write new descriptive "alt" or "label" text (no copying). Use an empty string for missing URLs.
   - Write "body_md" by paraphrasing the section. Include every fact, list item, and nuance. Remove placeholder tags and use Markdown bullets when helpful.
   - Add misconceptions only when the source hints at common mistakes.
   - Build at least one checkpoint using a **Generate -> Analyze -> Assign** flow:
       1. Generate the question text.
       2. Write the correct answer text explicitly and then generate three distinct distractor texts.
       3. Combine the correct answer and the three distractors into a four-item options array in randomized order.
       4. Re-read the finalized options array and determine which position (0, 1, 2, or 3) now contains the correct answer text. Set "correct_index" to that position.
       5. Craft the rationale so it explains the medical reasoning for the correct option and briefly contrasts it with the incorrect choices.
     Short-answer checkpoints may include helpful answer patterns.
3. Summarize the whole topic into the "key_points" array (up to five paraphrased bullets).

Before returning:
- Confirm every fact from the SOURCE TEXT appears somewhere in the JSON (objectives, sections, checkpoints, assets, or key points).
- Ensure wording is paraphrased and nothing repeats the original text verbatim.
- Verify schema compliance and double-check that each MCQ "correct_index" matches the option supported by the rationale.
- Validate field lengths and array sizes align with the schema reference.

Return only the final JSON object (no commentary or code fences).
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
      { apiVersion: "v1beta" },
    );

    const result = await runWithRetry(() =>
      model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: fullPrompt }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    );

    const response = await result.response;
    const rawOutput = (await response.text()).trim();

    let structuredContent;
    try {
      structuredContent = JSON.parse(rawOutput);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", rawOutput);
      throw new Error(`AI response was not valid JSON: ${parseError.message}`);
    }

    const { structured: sanitizedContent, debugLogs } = sanitizeStructuredContent(structuredContent);
    debugLogs.forEach((log) => {
      console.log(
        `[structureGenerator] section ${log.sectionOrder} checkpoint ${log.checkpointIndex} -> ai_index=${log.aiCorrectIndex}, selected_index=${log.selectedIndex}`,
      );
    });

    if (!validateStructure(sanitizedContent)) {
      console.error("AI output failed validation:", validateStructure.errors);
      return res.status(422).json({
        error: "AI failed to generate a valid structure.",
        details: validateStructure.errors,
      });
    }

    res.json({ structured: sanitizedContent });
  } catch (error) {
    console.error("Error in /api/structure endpoint:", error);
    if (error?.status === 503 || error?.status === 429) {
      return res
        .status(503)
        .json({ error: "Our AI tutor is busy. Please try again in a few seconds." });
    }
    res.status(500).json({ error: error.message || "An unexpected error occurred." });
  }
});

export default router;


