import express from "express";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import crypto from "crypto";
import requireAdmin from "../middleware/auth.js";
import slugify from "../utils/slugify.js";

const router = express.Router();

function createQuestionId(text) {
  if (!text) return null;
  const normalizedText = text
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return crypto.createHash("sha1").update(normalizedText).digest("hex");
}

function createPaperKey(metadata) {
  return `${metadata.exam}|${metadata.year}|${metadata.month}|${metadata.paper}`;
}

function createAppearanceId(paperKey, questionNumber) {
  return `${paperKey}#${questionNumber}`;
}

router.post("/", requireAdmin, express.json(), async (req, res) => {
  const db = getFirestore();
  try {
    const { questions, metadata } = req.body;
    const uid = req.user?.uid || "admin-user";

    if (!questions || !metadata || !Array.isArray(questions)) {
      return res.status(400).json({ error: "Invalid request body." });
    }

    const questionsRef = db.collection("questions");
    const papersRef = db.collection("papers");
    const appearancesRef = db.collection("paperAppearances");

    const paperKey = createPaperKey(metadata);
    const paperDocRef = papersRef.doc(paperKey);
    const paperData = {
      exam: metadata.exam,
      year: Number(metadata.year),
      month: metadata.month,
      paper: metadata.paper,
    };

    const validEntries = questions
      .filter(
        (question) =>
          question &&
          typeof question.questionText === "string" &&
          question.questionText.trim().length,
      )
      .filter((question) => Number.isFinite(question.questionNumber))
      .map((question) => {
        const questionId = createQuestionId(question.questionText);
        if (!questionId) return null;
        const topicRaw =
          typeof question.topic === "string" && question.topic.trim().length
            ? question.topic.trim()
            : "Untagged";
        return {
          question,
          questionId,
          topic: topicRaw,
          topicSlug: slugify(topicRaw),
          marks: Number.isFinite(question.marks) ? Number(question.marks) : 0,
          marksDistribution:
            typeof question.marksDistribution === "string"
              ? question.marksDistribution.trim()
              : "",
          questionDocRef: questionsRef.doc(questionId),
          appearanceDocRef: appearancesRef.doc(
            createAppearanceId(paperKey, question.questionNumber),
          ),
        };
      })
      .filter(Boolean);

    if (!validEntries.length) {
      return res.status(400).json({ error: "No valid questions provided." });
    }

    const chunkSize = 20;
    const existingMap = new Map();
    for (let index = 0; index < validEntries.length; index += chunkSize) {
      const chunk = validEntries.slice(index, index + chunkSize);
      const snapshots = await Promise.all(
        chunk.map((entry) => entry.questionDocRef.get()),
      );
      snapshots.forEach((snap, idx) => {
        existingMap.set(chunk[idx].questionId, snap.exists);
      });
    }

    const batch = db.batch();
    let newQuestionsAdded = 0;
    let existingQuestionsUpdated = 0;

    batch.set(paperDocRef, paperData, { merge: true });

    validEntries.forEach((entry) => {
      const exists = existingMap.get(entry.questionId);
      if (exists) {
        existingQuestionsUpdated += 1;
      } else {
        newQuestionsAdded += 1;
      }

      const questionData = {
        questionText: entry.question.questionText,
        topic: entry.topic,
        topicSlug: entry.topicSlug,
        marks: entry.marks,
        marksDistribution: entry.marksDistribution,
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (!exists) {
        questionData.createdAt = FieldValue.serverTimestamp();
        questionData.firstUploaderId = uid;
        questionData.editCount = 1;
      } else {
        questionData.editCount = FieldValue.increment(1);
      }

      batch.set(entry.questionDocRef, questionData, { merge: true });

      batch.set(
        entry.appearanceDocRef,
        {
          paperKey,
          questionId: entry.questionId,
          questionNumber: entry.question.questionNumber,
          questionText: entry.question.questionText,
          marks: entry.marks,
          marksDistribution: entry.marksDistribution,
          topic: entry.topic,
          topicSlug: entry.topicSlug,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });

    await batch.commit();

    return res.status(200).json({
      message: "Save operation completed successfully.",
      newQuestionsAdded,
      existingQuestionsUpdated,
    });
  } catch (error) {
    console.error("Error saving questions:", error);
    return res
      .status(500)
      .json({ error: "An error occurred while saving questions." });
  }
});

export default router;
