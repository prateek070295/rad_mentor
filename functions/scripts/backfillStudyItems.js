// functions/scripts/backfillStudyItems.js
import { onRequest } from "firebase-functions/v2/https";
import { getApp, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// Safe Admin init
try { getApp(); } catch { initializeApp(); }
const db = getFirestore();

function deriveLevel(topicId) {
  const depth = String(topicId || "").split(".").length;
  if (depth <= 1) return "chapter";
  if (depth === 2) return "topic";
  return "subtopic";
}
function normalizeCategory(category) {
  if (!category) return "good";
  const c = String(category).toLowerCase().trim().replace(/[-_]/g, " ");
  if (c.includes("must")) return "must";
  if (c.includes("good")) return "good";
  if (c.includes("nice")) return "nice";
  return "good";
}
const DEFAULT_MINUTES = { chapter: 90, topic: 45, subtopic: 20 };
function defaultMinutesFor(level) {
  return DEFAULT_MINUTES[level] ?? 45;
}


export const backfillStudyItems = onRequest({ region: "asia-south1" }, async (_req, res) => {
  try {
    // IMPORTANT: keep this inside the handler (not at top-level)
    const cg = await db.collectionGroup("nodes").get();
    let mirrored = 0;

    for (const docSnap of cg.docs) {
      const node = docSnap.data() || {};
      const topicId = docSnap.id;
      const section = docSnap.ref.parent.parent.id; // parent of 'nodes' is the section doc

      const level = deriveLevel(topicId);
      const categoryNorm = normalizeCategory(node.category);
      const foundational = !!node.foundational;
      const estimatedMinutes =
        Number(node.estimatedMinutes) > 0 ? Number(node.estimatedMinutes) : defaultMinutesFor(level);

      const payload = {
        itemId: topicId,
        section,
        name: node.name || "",
        path: Array.isArray(node.path) ? node.path : [],
        order: typeof node.order === "number" ? node.order : 0,
        parentId: node.parentId || null,
        level,
        categoryNorm,
        foundational,
        estimatedMinutes,
        updatedAt: FieldValue.serverTimestamp(),
      };

      await db.doc(`study_items/${section}__${topicId}`).set(payload, { merge: true });
      mirrored++;
    }

    res.status(200).json({ ok: true, mirrored });
  } catch (err) {
    console.error("backfillStudyItems error:", err);
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});
