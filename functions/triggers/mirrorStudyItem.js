// functions/triggers/mirrorStudyItem.js
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getApp, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// Ensure Admin is initialized even if this module loads before index.js
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

/**
 * Mirror /sections/{section}/nodes/{topicId} -> /study_items/{section}__{topicId}
 * - On create/update: upsert mirror with derived fields
 * - On delete: remove mirror
 */
export const mirrorStudyItem = onDocumentWritten(
  { document: "sections/{section}/nodes/{topicId}", region: "asia-south1" },
  async (event) => {
    const { section, topicId } = event.params;
    const mirrorRef = db.doc(`study_items/${section}__${topicId}`);

    // Handle delete
    if (!event.data?.after || !event.data.after.exists) {
      await mirrorRef.delete().catch(() => {});
      return;
    }

    const node = event.data.after.data() || {};
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

    await mirrorRef.set(payload, { merge: true });
  }
);
