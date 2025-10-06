// functions/triggers/mirrorStudyItem.js
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { getApp, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

try { getApp(); } catch { initializeApp(); }
const db = getFirestore();

const SUB_MINUTES = 10; // atomic duration per subtopic

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

// ---- Rollups ---------------------------------------------------------------

async function rollupTopic(section, topicId) {
  // minutes(topic) = max(subCount * SUB_MINUTES, 10)
  const subs = await db.collection("study_items")
    .where("section", "==", section)
    .where("level", "==", "subtopic")
    .where("parentId", "==", topicId)
    .get();

  const subCount = subs.size;
  const minutes = Math.max(subCount * SUB_MINUTES, 10);

  const topicRef = db.doc(`study_items/${section}__${topicId}`);
  const topicSnap = await topicRef.get();
  const topicData = topicSnap.data() || {};

  await topicRef.set({
    estimatedMinutes: minutes,
    subtopicCount: subCount,
    minutesMethod: "topic-rollup@sub10-min10",
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return topicData.parentId || null; // chapterId
}

async function rollupChapter(section, chapterId) {
  // minutes(chapter) = sum(topic.estimatedMinutes)
  const topics = await db.collection("study_items")
    .where("section", "==", section)
    .where("level", "==", "topic")
    .where("parentId", "==", chapterId)
    .get();

  let total = 0, tCount = 0;
  for (const t of topics.docs) {
    total += Number(t.data().estimatedMinutes) || 0;
    tCount++;
  }

  await db.doc(`study_items/${section}__${chapterId}`).set({
    estimatedMinutes: total,
    topicCount: tCount,
    minutesMethod: "chapter-rollup@sum-topics",
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function rollupTopicAndChapter(section, topicId) {
  const chapterId = await rollupTopic(section, topicId);
  if (chapterId) await rollupChapter(section, chapterId);
}

// ---- Trigger ----------------------------------------------------------------

export const mirrorStudyItem = onDocumentWritten({
  region: "asia-south1",
  document: "sections/{sectionId}/nodes/{nodeId}",
}, async (event) => {
  const section = event.params.sectionId;
  const nodeId = event.params.nodeId;

  const after = event.data?.after?.data();   // undefined on delete
  const before = event.data?.before?.data(); // undefined on create

  // DELETE: remove mirror + roll up upwards
  if (!after) {
    await db.doc(`study_items/${section}__${nodeId}`).delete().catch(() => {});
    const level = deriveLevel(nodeId);

    if (level === "subtopic" && before?.parentId) {
      // subtopic removed -> recompute its (old) topic & chapter
      await rollupTopicAndChapter(section, before.parentId);
    } else if (level === "topic" && before?.parentId) {
      // topic removed -> recompute (old) chapter
      await rollupChapter(section, before.parentId);
    }
    // if chapter deleted: nothing else to roll up
    return;
  }

  // UPSERT/MIRROR the node
  const level = deriveLevel(nodeId);
  const payload = {
    itemId: nodeId,
    section,
    name: after.name || "",
    path: Array.isArray(after.path) ? after.path : [],
    order: typeof after.order === "number" ? after.order : 0,
    parentId: after.parentId || null,
    level,
    categoryNorm: normalizeCategory(after.category),
    foundational: !!after.foundational,
    updatedAt: FieldValue.serverTimestamp(),
  };

  // Subtopic: carry atomic minutes here
  if (level === "subtopic") payload.estimatedMinutes = SUB_MINUTES;

  await db.doc(`study_items/${section}__${nodeId}`).set(payload, { merge: true });

  // Parent moves (handle both old and new parents)
  const parentChanged = before && after && before.parentId !== after.parentId;

  if (level === "subtopic") {
    if (parentChanged) {
      if (before?.parentId) await rollupTopicAndChapter(section, before.parentId);
      if (after.parentId) await rollupTopicAndChapter(section, after.parentId);
    } else if (after.parentId) {
      await rollupTopicAndChapter(section, after.parentId);
    }
  } else if (level === "topic") {
    if (parentChanged) {
      // Topic moved to another chapter: recompute its minutes (from subs), then both chapters
      await rollupTopic(section, nodeId);
      if (before?.parentId) await rollupChapter(section, before.parentId);
      if (after.parentId) await rollupChapter(section, after.parentId);
    } else {
      await rollupTopicAndChapter(section, nodeId);
    }
  } else if (level === "chapter") {
    // Chapter changed: recompute chapter rollup
    await rollupChapter(section, nodeId);
  }
});
