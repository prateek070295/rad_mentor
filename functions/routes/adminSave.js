import express from "express";
import { getFirestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import requireAdmin from "../middleware/auth.js";

const router = express.Router();

const contentSectionsCol = (db, organ, topicId) => {
  const nodeRef = db.collection('sections').doc(organ).collection('nodes').doc(topicId);
  return nodeRef.collection('contentSections');
};

const ALLOWED_BLOOM_LEVELS = ["remember", "understand", "apply", "analyze", "evaluate"];
const DEFAULT_BLOOM_LEVEL = "understand";

const asString = (value, fallback = "") => {
  if (typeof value === "string") return value;
  if (value == null) return fallback;
  return String(value);
};

const trimString = (value, maxLength) => asString(value).trim().slice(0, maxLength);

const sanitizeObjectives = (values) =>
  Array.isArray(values)
    ? values
        .map((entry) => trimString(entry, 600))
        .filter((entry) => entry.length)
        .slice(0, 5)
    : [];

const sanitizeImages = (images) =>
  Array.isArray(images)
    ? images
        .map((image) => ({
          alt: trimString(image?.alt, 300),
          url: trimString(image?.url, 300),
          source: trimString(image?.source, 100),
          figure_id: trimString(image?.figure_id, 50),
        }))
        .filter((image) => image.alt)
        .slice(0, 5)
    : [];

const sanitizeCases = (cases) =>
  Array.isArray(cases)
    ? cases
        .map((item) => ({
          label: trimString(item?.label, 300),
          url: trimString(item?.url, 300),
        }))
        .filter((item) => item.label)
        .slice(0, 5)
    : [];

const sanitizeMisconceptions = (items) =>
  Array.isArray(items)
    ? items
        .map((entry) => ({
          claim: trimString(entry?.claim, 600),
          correction: trimString(entry?.correction, 600),
        }))
        .filter((entry) => entry.claim && entry.correction)
        .slice(0, 3)
    : [];

const sanitizeTables = (tables) => {
  if (!Array.isArray(tables)) return [];
  const sanitized = [];
  for (const [index, table] of tables.entries()) {
    const headers = Array.isArray(table?.headers)
      ? table.headers
          .map((header, idx) => trimString(header || `Column ${idx + 1}`, 200))
          .filter((header) => header.length)
          .slice(0, 10)
      : [];
    const columnCount = Math.min(Math.max(headers.length, 1), 10);
    const effectiveHeaders =
      headers.length === columnCount
        ? headers
        : Array.from({ length: columnCount }, (_, idx) =>
            headers[idx] ? headers[idx] : `Column ${idx + 1}`,
          );

    const rows = Array.isArray(table?.rows)
      ? table.rows
          .slice(0, 40)
          .map((row) => {
            if (!Array.isArray(row)) return null;
            const cells = row.slice(0, columnCount).map((cell) =>
              trimString(cell && typeof cell === "object" ? cell.content : cell, 400),
            );
            while (cells.length < columnCount) {
              cells.push("");
            }
            return cells.some((cell) => cell.length) ? cells : null;
          })
          .filter(Boolean)
      : [];

    if (!rows.length) continue;

    sanitized.push({
      table_id: trimString(table?.table_id, 100) || trimString(table?.localId, 100) || randomUUID(),
      caption:
        trimString(table?.caption, 400) ||
        `Table ${sanitized.length + 1 + index}`,
      headers: effectiveHeaders,
      rows: rows.map((cells) => ({ cells })),
    });
    if (sanitized.length >= 8) break;
  }
  return sanitized;
};

const sanitizeHints = (hints) =>
  Array.isArray(hints)
    ? hints
        .map((hint) => trimString(hint, 300))
        .filter((hint) => hint.length)
        .slice(0, 3)
    : [];

const sanitizeAnswerPatterns = (patterns) =>
  Array.isArray(patterns)
    ? patterns
        .map((pattern) => trimString(pattern, 300))
        .filter((pattern) => pattern.length)
        .slice(0, 10)
    : [];

const sanitizeCheckpoint = (checkpoint) => {
  const type = checkpoint?.type === "short" ? "short" : "mcq";
  const base = {
    type,
    question_md: trimString(checkpoint?.question_md, 500),
    rationale_md: trimString(checkpoint?.rationale_md, 1000),
    hints: sanitizeHints(checkpoint?.hints),
    bloom_level: ALLOWED_BLOOM_LEVELS.includes(asString(checkpoint?.bloom_level).toLowerCase())
      ? asString(checkpoint?.bloom_level).toLowerCase()
      : DEFAULT_BLOOM_LEVEL,
    figure_id: trimString(checkpoint?.figure_id, 50),
  };

  if (type === "mcq") {
    const options = Array.isArray(checkpoint?.options) ? checkpoint.options.slice(0, 4) : [];
    while (options.length < 4) options.push("");
    const sanitizedOptions = options.map((option) => trimString(option, 300));
    const correctIndex =
      Number.isInteger(checkpoint?.correct_index) && checkpoint.correct_index >= 0
        ? Math.min(checkpoint.correct_index, sanitizedOptions.length - 1)
        : 0;

    return {
      ...base,
      options: sanitizedOptions,
      correct_index: correctIndex,
      answer_patterns: [],
    };
  }

  return {
    ...base,
    answer_patterns: sanitizeAnswerPatterns(checkpoint?.answer_patterns),
  };
};

const sanitizeCheckpoints = (checkpoints) =>
  Array.isArray(checkpoints)
    ? checkpoints
        .map(sanitizeCheckpoint)
        .filter((checkpoint) => checkpoint.question_md.length)
    : [];

const sanitizeSection = (section, index = 0) => {
  const order = Number.isInteger(section?.order) ? section.order : index + 1;
  const bodyMd = trimString(section?.body_md, 1200);
  const sanitizedBody =
    bodyMd.length >= 50
      ? bodyMd
      : bodyMd
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .join(" ");

  const sanitized = {
    title: trimString(section?.title, 100),
    order,
    body_md: sanitizedBody,
    images: sanitizeImages(section?.images),
    cases: sanitizeCases(section?.cases),
    misconceptions: sanitizeMisconceptions(section?.misconceptions),
    tables: sanitizeTables(section?.tables),
  };

  const checkpoints = sanitizeCheckpoints(section?.checkpoints);
  const ensuredCheckpoints =
    checkpoints.length > 0
      ? checkpoints
      : [
          sanitizeCheckpoint({
            type: "mcq",
            question_md: "Placeholder checkpoint question?",
            rationale_md: "Placeholder rationale.",
            options: ["Option A", "Option B", "Option C", "Option D"],
            correct_index: 0,
          }),
        ];

  return {
    section: sanitized,
    checkpoints: ensuredCheckpoints,
  };
};

router.post("/", requireAdmin, express.json(), async (req, res) => {
  const db = getFirestore();
  const { organ, topicId, structured } = req.body;

  if (!organ || !topicId || !structured) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const nodeRef = db.collection('sections').doc(organ).collection('nodes').doc(topicId);
    const csColRef = nodeRef.collection('contentSections');
    const mutations = [];

    const enqueue = (op) => mutations.push(op);

    const sanitizedObjectives = sanitizeObjectives(structured.objectives);
    const sanitizedKeyPoints = sanitizeObjectives(structured.key_points);
    const hasSections = Array.isArray(structured.sections) && structured.sections.length > 0;

    enqueue({
      type: "set",
      ref: nodeRef,
      data: {
        objectives: sanitizedObjectives,
        key_points: sanitizedKeyPoints,
        hasStructuredContent: hasSections,
        contentSectionsCount: hasSections ? structured.sections.length : 0,
        publishedAt: Date.now(),
      },
      options: { merge: true },
    });

    // Step 1 - Queue deletes for existing content sections and checkpoints
    const existingDocsSnapshot = await csColRef.get();
    if (!existingDocsSnapshot.empty) {
      const checkpointSnapshots = await Promise.all(
        existingDocsSnapshot.docs.map(async (doc) => {
          const checkpointsRef = doc.ref.collection('checkpoints');
          const snapshot = await checkpointsRef.get();
          return { doc, snapshot };
        }),
      );

      checkpointSnapshots.forEach(({ doc, snapshot }) => {
        snapshot.docs.forEach((cpDoc) => {
          enqueue({ type: "delete", ref: cpDoc.ref });
        });
        enqueue({ type: "delete", ref: doc.ref });
      });
    }

    // Step 2 - Add the new, edited sections
    if (structured.sections && structured.sections.length > 0) {
      structured.sections.forEach((section, index) => {
        const { section: sanitizedSection, checkpoints } = sanitizeSection(section, index);
        const secRef = csColRef.doc(); // Auto-generate a new ID

        enqueue({ type: "set", ref: secRef, data: sanitizedSection });

        if (checkpoints && checkpoints.length > 0) {
          const cpColRef = secRef.collection('checkpoints');
          checkpoints.forEach((checkpoint) => {
            const cpRef = cpColRef.doc(); // Auto-generate a new ID
            enqueue({ type: "set", ref: cpRef, data: checkpoint });
          });
        }
      });
    }

    const MAX_OPS_PER_BATCH = 450;
    let successBatches = 0;
    let failedBatches = 0;

    const chunks = [];
    for (let index = 0; index < mutations.length; index += MAX_OPS_PER_BATCH) {
      chunks.push(mutations.slice(index, index + MAX_OPS_PER_BATCH));
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    for (const [chunkIndex, chunk] of chunks.entries()) {
      let attempt = 0;
      let committed = false;
      while (attempt < 3 && !committed) {
        const batch = db.batch();
        chunk.forEach((operation) => {
          if (operation.type === "set") {
            batch.set(operation.ref, operation.data, operation.options);
          } else if (operation.type === "delete") {
            batch.delete(operation.ref);
          }
        });

        try {
          await batch.commit();
          committed = true;
          successBatches += 1;
        } catch (batchError) {
          attempt += 1;
          if (attempt >= 3) {
            failedBatches += 1;
            console.error(
              `Failed to commit batch ${chunkIndex + 1} after ${attempt} attempts`,
              batchError,
            );
          } else {
            const delay = 100 * 2 ** (attempt - 1);
            console.warn(
              `Retrying batch ${chunkIndex + 1} (attempt ${attempt + 1}) after ${delay}ms`,
              batchError,
            );
            await sleep(delay);
          }
        }
      }
    }

    console.info(
      `adminSave: committed ${successBatches} batches${failedBatches ? `, ${failedBatches} failed` : ""}`,
    );

    if (failedBatches > 0) {
      return res.status(500).json({ error: "Failed to update some content batches." });
    }

    res.status(200).json({ message: "Content updated successfully." });

  } catch (error) {
    console.error("Error updating structured content:", error);
    res.status(500).json({ error: "Failed to update content." });
  }
});

export default router;
