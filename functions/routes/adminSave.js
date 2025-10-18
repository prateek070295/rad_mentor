import express from "express";
import { getFirestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";

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

router.post("/", express.json(), async (req, res) => {
  const db = getFirestore();
  const { organ, topicId, structured } = req.body;

  if (!organ || !topicId || !structured) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const batch = db.batch();
    const nodeRef = db.collection('sections').doc(organ).collection('nodes').doc(topicId);
    const csColRef = nodeRef.collection('contentSections');

    // --- NEW: Update the parent node with objectives and key points ---
    batch.set(nodeRef, {
      objectives: sanitizeObjectives(structured.objectives),
      key_points: sanitizeObjectives(structured.key_points),
    }, { merge: true });

    // Step 1 - Delete all existing contentSections to prevent duplicates
    const existingDocsSnapshot = await csColRef.get();
    if (!existingDocsSnapshot.empty) {
      const checkpointDeletes = [];
      existingDocsSnapshot.docs.forEach((doc) => {
        const checkpointsRef = doc.ref.collection('checkpoints');
        checkpointDeletes.push(
          checkpointsRef.get().then((snapshot) => {
            snapshot.docs.forEach((cpDoc) => batch.delete(cpDoc.ref));
          })
        );
        batch.delete(doc.ref);
      });
      await Promise.all(checkpointDeletes);
    }

    // Step 2 - Add the new, edited sections
    if (structured.sections && structured.sections.length > 0) {
      structured.sections.forEach((section, index) => {
        const { section: sanitizedSection, checkpoints } = sanitizeSection(section, index);
        const secRef = csColRef.doc(); // Auto-generate a new ID

        batch.set(secRef, sanitizedSection);

        if (checkpoints && checkpoints.length > 0) {
          const cpColRef = secRef.collection('checkpoints');
          checkpoints.forEach((checkpoint) => {
            const cpRef = cpColRef.doc(); // Auto-generate a new ID
            batch.set(cpRef, checkpoint);
          });
        }
      });
    }

    await batch.commit();
    res.status(200).json({ message: "Content updated successfully." });

  } catch (error) {
    console.error("Error updating structured content:", error);
    res.status(500).json({ error: "Failed to update content." });
  }
});

export default router;
