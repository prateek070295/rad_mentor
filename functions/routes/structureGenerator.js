// placeholder
// file: functions/routes/structureGenerator.js

import { randomUUID } from "node:crypto";
import express from "express";
import { getGenAI, runWithRetry } from "../helpers.js";
import { validateStructure } from "../validators/contentSchema.js";
import requireAdmin from "../middleware/auth.js";
import truncateText from "../utils/truncateText.js";

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
          tables: {
            type: "array",
            maxItems: 8,
            items: {
              type: "object",
              required: ["table_id", "caption", "headers", "rows"],
              properties: {
                table_id: { type: "string", minLength: 3, maxLength: 100 },
                caption: { type: "string", minLength: 3, maxLength: 400 },
                headers: {
                  type: "array",
                  minItems: 1,
                  maxItems: 10,
                  items: { type: "string", minLength: 1, maxLength: 200 },
                },
                rows: {
                  type: "array",
                  minItems: 1,
                  maxItems: 40,
                  items: {
                    type: "array",
                    minItems: 1,
                    maxItems: 10,
                    items: {
                      type: "object",
                      required: ["content"],
                      properties: {
                        content: { type: "string", maxLength: 400 },
                      },
                    },
                  },
                },
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
                correct_index: { type: "integer", minimum: 0, maximum: 3 },
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

const ALLOWED_BLOOM_LEVELS = ["remember", "understand", "apply", "analyze", "evaluate"];
const DEFAULT_BLOOM_LEVEL = "understand";

const ASCII_BORDER_REGEX = /^\s*\+(?:[-=]+\+)+\s*$/;
const ASCII_ROW_REGEX = /^\s*\|.*\|\s*$/;

const isAsciiBorderLine = (line) => ASCII_BORDER_REGEX.test(line);
const isAsciiRowLine = (line) => ASCII_ROW_REGEX.test(line) && line.split("|").length >= 4;

const collapseAsciiRowBlock = (blockLines, columnCount) => {
  const cells = Array.from({ length: columnCount }, () => "");
  blockLines.forEach((line) => {
    const parts = line.split("|").slice(1, -1);
    while (parts.length < columnCount) parts.push("");
    if (parts.length > columnCount) parts.length = columnCount;
    parts.forEach((raw, idx) => {
      const trimmed = raw.replace(/\s+/g, " ").trim();
      if (!trimmed) return;
      if (!cells[idx]) {
        cells[idx] = trimmed;
      } else {
        cells[idx] = `${cells[idx]}<br>${trimmed}`;
      }
    });
  });
  return cells;
};

const parseAsciiTableBlock = (lines, startIndex) => {
  const rowBlocks = [];
  let columnCount = 0;
  let currentBlock = [];
  let i = startIndex;
  let lastIncludedIndex = startIndex;

  while (i + 1 < lines.length) {
    i += 1;
    const line = lines[i];

    if (isAsciiBorderLine(line)) {
      lastIncludedIndex = i;
      if (currentBlock.length) {
        rowBlocks.push(currentBlock);
        currentBlock = [];
      }

      if (i + 1 >= lines.length || !isAsciiRowLine(lines[i + 1])) {
        break;
      }
      continue;
    }

    if (isAsciiRowLine(line)) {
      currentBlock.push(line);
      lastIncludedIndex = i;
      if (!columnCount) {
        columnCount = line.split("|").length - 2;
      }
      continue;
    }

    if (!line.trim()) {
      lastIncludedIndex = i;
      break;
    }

    // Non-table content reached.
    break;
  }

  if (currentBlock.length) {
    rowBlocks.push(currentBlock);
  }

  if (!rowBlocks.length || !columnCount) {
    return null;
  }

  const headerBlock = rowBlocks.shift();
  if (!headerBlock) {
    return null;
  }

  const headers = collapseAsciiRowBlock(headerBlock, columnCount).map((cell, idx) =>
    cell || `Column ${idx + 1}`,
  );

  const dataRows = rowBlocks.map((block) => collapseAsciiRowBlock(block, columnCount));
  if (!dataRows.length) {
    return null;
  }

  const markdownLines = [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...dataRows.map((row) => `| ${row.map((cell) => cell || "").join(" | ")} |`),
  ];

  return { markdownLines, endIndex: lastIncludedIndex };
};

const convertAsciiTablesToMarkdown = (text) => {
  if (!text || typeof text !== "string") return text;
  const lines = text.split(/\r?\n/);
  const output = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (isAsciiBorderLine(line) && index + 1 < lines.length && isAsciiRowLine(lines[index + 1])) {
      const parsed = parseAsciiTableBlock(lines, index);
      if (parsed) {
        output.push(...parsed.markdownLines);
        index = parsed.endIndex + 1;
        continue;
      }
    }
    output.push(line);
    index += 1;
  }

  return output.join("\n");
};

const splitMarkdownRow = (line) => {
  if (!line || typeof line !== "string") return null;
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return null;
  const normalized = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return normalized.split("|").map((cell) => cell.trim());
};

const isMarkdownDividerLine = (line) => {
  if (!line || typeof line !== "string") return false;
  const cells = splitMarkdownRow(line);
  if (!cells || !cells.length) return false;
  return cells.every((cell) => /^[:\s-]+$/.test(cell));
};

const parseMarkdownTableLines = (tableLines) => {
  if (!Array.isArray(tableLines) || tableLines.length < 3) return null;
  const headerCells = splitMarkdownRow(tableLines[0]);
  if (!headerCells || !headerCells.length) return null;

  const columnCount = headerCells.length;
  const headers = headerCells.map((cell, idx) => (cell ? cell : `Column ${idx + 1}`));

  const rows = [];
  for (let idx = 2; idx < tableLines.length; idx += 1) {
    const row = splitMarkdownRow(tableLines[idx]);
    if (!row) continue;
    while (row.length < columnCount) row.push("");
    if (row.length > columnCount) row.length = columnCount;
    const normalized = row.map((cell) => cell || "");
    if (normalized.every((cell) => !cell)) continue;
    rows.push(normalized);
  }

  if (!rows.length) {
    return null;
  }

  return { headers, rows };
};

const extractMarkdownTables = (text) => {
  if (!text || typeof text !== "string") {
    return { tables: [], body: text || "" };
  }

  const lines = text.split("\n");
  const tables = [];
  const removeIndices = new Set();
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.includes("|")) {
      const headerCells = splitMarkdownRow(line);
      if (headerCells && headerCells.length) {
        const dividerLine = lines[i + 1];
        if (dividerLine && isMarkdownDividerLine(dividerLine)) {
          const tableLines = [lines[i], dividerLine];
          let j = i + 2;
          while (j < lines.length && splitMarkdownRow(lines[j])) {
            tableLines.push(lines[j]);
            j += 1;
          }
          const parsed = parseMarkdownTableLines(tableLines);
          if (parsed) {
            tables.push(parsed);
            for (let removeIndex = i; removeIndex < j; removeIndex += 1) {
              removeIndices.add(removeIndex);
            }
            i = j;
            continue;
          }
        }
      }
    }
    i += 1;
  }

  const cleanedLines = lines.filter((_, idx) => !removeIndices.has(idx));
  const cleanedBody = cleanedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  return { tables, body: cleanedBody };
};

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

    const tablesInput = Array.isArray(nextSection.tables) ? nextSection.tables : [];
    const sanitizedTables =
      tablesInput
        .map((table, tableIndex) => {
          const tableId =
            typeof table?.table_id === "string" && table.table_id.trim()
              ? table.table_id.trim().slice(0, 100)
              : randomUUID();

          const captionRaw =
            typeof table?.caption === "string" ? table.caption : String(table?.caption || "");
          let caption = captionRaw.trim().slice(0, 400);

          const headerCandidates = Array.isArray(table?.headers) ? table.headers : [];
          let headers = headerCandidates
            .map((header) => (header == null ? "" : String(header).trim().slice(0, 200)))
            .filter((header) => header);

          const rowCandidates = Array.isArray(table?.rows) ? table.rows : [];
          const maxColumnsFromRows = rowCandidates.reduce(
            (max, row) => Math.max(max, Array.isArray(row) ? row.length : 0),
            0,
          );

          if (!headers.length && maxColumnsFromRows > 0) {
            const inferredCount = Math.min(maxColumnsFromRows, 10);
            headers = Array.from({ length: inferredCount }, (_, idx) => `Column ${idx + 1}`);
          }

          if (!headers.length) {
            return null;
          }

          const columnCount = Math.min(headers.length, 10);
          headers = headers.slice(0, columnCount);

          const rows =
            rowCandidates
              .slice(0, 40)
              .map((row) => {
                if (!Array.isArray(row)) return null;
                const cells = row.slice(0, columnCount).map((cell) => {
                  const content =
                    cell && typeof cell === "object" && "content" in cell
                      ? cell.content
                      : cell ?? "";
                  return {
                    content: String(content).trim().slice(0, 400),
                  };
                });

                while (cells.length < columnCount) {
                  cells.push({ content: "" });
                }

                const hasContent = cells.some((cell) => cell.content);
                return hasContent ? cells : null;
              })
              .filter((row) => Array.isArray(row)) ?? [];

          if (!rows.length) {
            return null;
          }

          if (!caption) {
            caption = `Table ${tableIndex + 1}`;
          }

          return {
            table_id: tableId,
            caption,
            headers,
            rows,
          };
        })
        .filter((table) => table) || [];

    nextSection.tables = sanitizedTables;

    const bodyWithMarkdownTables = convertAsciiTablesToMarkdown(nextSection.body_md || "");
    const { tables: extractedTables, body: bodyWithoutTables } =
      extractMarkdownTables(bodyWithMarkdownTables);

    nextSection.body_md = bodyWithoutTables
      .replace(/\s+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const additionalTables = [];
    extractedTables.forEach((table) => {
      const columnCount = Math.min(Math.max(table.headers.length || 0, 1), 10);
      const headers = table.headers
        .slice(0, columnCount)
        .map((header, idx) => {
          const trimmed = String(header || "").trim().slice(0, 200);
          return trimmed || `Column ${idx + 1}`;
        });

      const rows = table.rows
        .slice(0, 40)
        .map((row) => {
          const normalizedRow = row.slice(0, columnCount);
          while (normalizedRow.length < columnCount) normalizedRow.push("");
          const cells = normalizedRow.map((cell) => ({
            content: String(cell || "").trim().slice(0, 400),
          }));
          return cells.some((cell) => cell.content) ? cells : null;
        })
        .filter((row) => Array.isArray(row));

      if (!rows.length) {
        return;
      }

      const caption =
        typeof table.caption === "string" && table.caption.trim()
          ? table.caption.trim().slice(0, 400)
          : `Table ${sanitizedTables.length + additionalTables.length + 1}`;

      additionalTables.push({
        table_id: randomUUID(),
        caption,
        headers,
        rows,
      });
    });

    if (additionalTables.length) {
      nextSection.tables = [...(nextSection.tables || []), ...additionalTables].slice(0, 8);
    } else if (!Array.isArray(nextSection.tables)) {
      nextSection.tables = [];
    }

    if (additionalTables.length && nextSection.body_md.length < 50) {
      const fallbackNote = "Refer to the accompanying table for detailed structured data.";
      nextSection.body_md = nextSection.body_md
        ? `${nextSection.body_md}\n\n${fallbackNote}`
        : fallbackNote;
    }

    if ((nextSection.tables?.length || 0) > 0 && (nextSection.body_md || "").length < 50) {
      const fallbackNote =
        "Key findings are summarized in the table above; review each row alongside this brief narrative.";
      nextSection.body_md = nextSection.body_md
        ? `${nextSection.body_md}\n\n${fallbackNote}`
        : fallbackNote;
    }

    nextSection.checkpoints = (nextSection.checkpoints || []).map((checkpoint, cpIndex) => {
      const checkpointType = checkpoint?.type === "short" ? "short" : "mcq";
      const sanitized = { ...checkpoint, type: checkpointType };

      const normalizeBloomLevel = (value) => {
        if (typeof value !== "string") return DEFAULT_BLOOM_LEVEL;
        const normalized = value.toLowerCase();
        return ALLOWED_BLOOM_LEVELS.includes(normalized) ? normalized : DEFAULT_BLOOM_LEVEL;
      };
      sanitized.bloom_level = normalizeBloomLevel(checkpoint?.bloom_level);

      const question = String(checkpoint?.question_md || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 500);
      sanitized.question_md = question || "Please review this concept from the section.";

      const rationale = String(checkpoint?.rationale_md || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1000);
      sanitized.rationale_md =
        rationale ||
        "Review why this checkpoint answer is correct using the facts presented in the section.";

      const ensureHints = (value) => {
        if (!Array.isArray(value)) return [];
        return value
          .slice(0, 3)
          .map((hint) => String(hint || "").trim().slice(0, 300))
          .filter((hint) => hint);
      };
      sanitized.hints = ensureHints(checkpoint?.hints);

      if (checkpointType !== "mcq") {
        sanitized.answer_patterns = Array.isArray(checkpoint?.answer_patterns)
          ? checkpoint.answer_patterns
              .slice(0, 10)
              .map((pattern) => String(pattern || "").trim().slice(0, 300))
          : [];
        return sanitized;
      }

      const options = Array.isArray(sanitized.options) ? sanitized.options.slice(0, 4) : [];
      while (options.length < 4) options.push("");
      sanitized.options = options.map((option) =>
        String(option || "").trim().slice(0, 300) || "",
      );

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

  clone.sections.forEach((section, sectionIndex) => {
    const bodyText = section?.body_md || "";
    const tables = section?.tables || [];
    const markdownPattern = /(?:\r?\n|^)\s*\|.*\|\s*(?:\r?\n|$)/;
    const asciiPattern = /(?:\r?\n|^)\s*\+-{2,}/;
    if (!tables.length && (markdownPattern.test(bodyText) || asciiPattern.test(bodyText))) {
      debugLogs.push({
        sectionOrder: section?.order ?? sectionIndex + 1,
        tableFallback: true,
      });
    }
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
- Section object: requires "title" (3-100 chars), "order" (integer >= 1), "body_md" (50-1200 chars), and "checkpoints". Optional arrays: "misconceptions" (<= 3 items, each with "claim" and "correction" <= 600 chars), "images" (<= 5 items with "alt" <= 300 chars and optional "url"), "cases" (<= 5 items with "label" <= 300 chars and optional "url"), and "tables" (<= 8 items). Use an empty string for missing URLs.
- Table object: requires "table_id" (string), "caption" (<= 400 chars), "headers" (array of 1-10 strings, each <= 200 chars), and "rows" (array of 1-40 row arrays). Each row array must align with the headers and contains cell objects of the form { "content": string <= 400 }.
- Checkpoint object: requires "type" ("mcq" or "short"), "question_md" (<= 500 chars), "rationale_md" (<= 1000 chars), "hints" (array of <= 3 strings, each <= 300 chars; use [] if none), and "bloom_level" (one of "remember", "understand", "apply", "analyze", "evaluate").
- MCQ checkpoints: must also include "options" (exactly 4 strings, each <= 300 chars) and "correct_index" (integer 0-3 that matches the correct option).
- Short-answer checkpoints: may include "answer_patterns" (array of exemplar responses, each <= 300 chars).

Process:
1. Derive the top-level "objectives" that reflect the main learning goals in the SOURCE TEXT.
2. For each major heading:
   - Create a section object with a title and sequential order.
   - Locate any Markdown or ASCII tables. For each table you can confidently parse, capture it as a table object: infer headers, convert each row into arrays of cell objects, and write a concise caption. After structuring the data, remove the original table text before composing "body_md".
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
- If a table cannot be faithfully parsed, leave "tables" empty for that section and keep the original table text in "body_md" so a human can review it later.

Return only the final JSON object (no commentary or code fences).
`;

router.post("/", requireAdmin, express.json(), async (req, res) => {
  const { rawText } = req.body;
  if (!rawText) {
    return res.status(400).json({ error: "rawText is required." });
  }

  const normalizedRawText = convertAsciiTablesToMarkdown(rawText);
  const truncatedRawText = truncateText(normalizedRawText);
  const fullPrompt = `${SYSTEM_PROMPT}\n\n--- SOURCE TEXT ---\n${truncatedRawText}\n-------------------`;

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


