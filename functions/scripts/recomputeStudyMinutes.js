// functions/scripts/recomputeStudyMinutes.js
import { onRequest } from "firebase-functions/v2/https";
import { getApp, initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

try { getApp(); } catch { initializeApp(); }
const db = getFirestore();

const SUB_MINUTES = 10;

export const recomputeStudyMinutes = onRequest({ region: "asia-south1", timeoutSeconds: 540 }, async (_req, res) => {
  try {
    const writer = db.bulkWriter();

    // ---- 1) SUBTOPICS: set to flat 15 and accumulate totals per TOPIC ----
    const topicMinutes = new Map();     // key = `${section}__${topicId}` -> minutes
    const topicSubCount = new Map();    // key -> number of subtopics

    const subSnap = await db.collection("study_items")
      .where("level", "==", "subtopic")
      .get();

    let updatedSubs = 0;
    for (const d of subSnap.docs) {
      const data = d.data();
      const minutes = SUB_MINUTES;
      if (data.estimatedMinutes !== minutes || data.minutesMethod !== "subtopic-flat15") {
        writer.update(d.ref, {
          estimatedMinutes: minutes,
          minutesMethod: "subtopic-flat15",
          updatedAt: FieldValue.serverTimestamp(),
        });
        updatedSubs++;
      }
      const topicId = data.parentId;
      const section = data.section;
      if (topicId && section) {
        const tKey = `${section}__${topicId}`;
        topicMinutes.set(tKey, (topicMinutes.get(tKey) || 0) + SUB_MINUTES);
        topicSubCount.set(tKey, (topicSubCount.get(tKey) || 0) + 1);
      }
    }

    // ---- 2) TOPICS: set to sum of its subtopics; accumulate per CHAPTER ----
    const chapterMinutes = new Map();     // key = `${section}__${chapterId}` -> minutes
    const chapterTopicCount = new Map();  // key -> number of topics

    const topicSnap = await db.collection("study_items")
      .where("level", "==", "topic")
      .get();

    let updatedTopics = 0;
    for (const d of topicSnap.docs) {
      const data = d.data();
      const tKey = d.id; // `${section}__${itemId}`
      const sum = topicMinutes.get(tKey) || 0;
      const subCount = topicSubCount.get(tKey) || 0;
      const minutes = Math.max(sum, 10);
      // write minutes + counts on the topic doc
      writer.set(d.ref, {
        estimatedMinutes: minutes,
        subtopicCount: subCount,
        minutesMethod: "topic-rollup",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      updatedTopics++;

      // accumulate to chapter
      const chapterId = data.parentId;
      const section = data.section;
      if (chapterId && section) {
        const cKey = `${section}__${chapterId}`;
        chapterMinutes.set(cKey, (chapterMinutes.get(cKey) || 0) + sum);
        chapterTopicCount.set(cKey, (chapterTopicCount.get(cKey) || 0) + 1);
      }
    }

    // ---- 3) CHAPTERS: sum of topic minutes ----
    const chapterSnap = await db.collection("study_items")
      .where("level", "==", "chapter")
      .get();

    let updatedChapters = 0;
    for (const d of chapterSnap.docs) {
      const cKey = d.id;
      const sum = chapterMinutes.get(cKey) || 0;
      const tCount = chapterTopicCount.get(cKey) || 0;

      writer.set(d.ref, {
        estimatedMinutes: sum,
        topicCount: tCount,
        minutesMethod: "chapter-rollup",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      updatedChapters++;
    }

    await writer.close();
    res.json({ ok: true, updatedSubs, updatedTopics, updatedChapters });
  } catch (err) {
    console.error("recomputeStudyMinutes error:", err);
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});
