import express from "express";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import crypto from "crypto";

const router = express.Router();

function createQuestionId(text) {
  if (!text) return null;
  const normalizedText = text.toLowerCase().replace(/\[[^\]]*\]/g, '').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha1').update(normalizedText).digest('hex');
}

function createPaperKey(metadata) {
    return `${metadata.exam}|${metadata.year}|${metadata.month}|${metadata.paper}`;
}

function createAppearanceId(paperKey, questionNumber) {
    return `${paperKey}#${questionNumber}`;
}

router.post("/", express.json(), async (req, res) => {
    const db = getFirestore();
    try {
        const { questions, metadata } = req.body;
        const uid = req.auth?.uid;

        if (!questions || !metadata || !Array.isArray(questions)) {
            return res.status(400).json({ error: "Invalid request body." });
        }

        const questionsRef = db.collection("questions");
        const papersRef = db.collection("papers");
        const appearancesRef = db.collection("paperAppearances");

        const batch = db.batch();
        let newQuestionsAdded = 0;
        let existingQuestionsUpdated = 0;

        for (const question of questions) {
            if (!question || typeof question.questionText !== 'string' || !question.questionText.trim()) continue;
            if (typeof question.questionNumber !== 'number') continue;

            const questionId = createQuestionId(question.questionText);
            const paperKey = createPaperKey(metadata);
            const appearanceId = createAppearanceId(paperKey, question.questionNumber);
            
            const questionDocRef = questionsRef.doc(questionId);

            const docSnap = await questionDocRef.get();
            // ✨ FIX: Changed docSnap.exists() to docSnap.exists
            if (docSnap.exists) {
                existingQuestionsUpdated++;
            } else {
                newQuestionsAdded++;
            }
            
            const questionData = {
                questionText: question.questionText,
                topic: (typeof question.topic === 'string' ? question.topic.replace(/[^\w]/g, '').toLowerCase() : 'untagged'),
                marks: typeof question.marks === 'number' ? question.marks : 0,
                marksDistribution: typeof question.marksDistribution === 'string' ? question.marksDistribution : "",
                createdAt: FieldValue.serverTimestamp(),
                firstUploaderId: uid || 'admin-user',
            };
            batch.set(questionDocRef, questionData, { merge: true });

            const paperDocRef = papersRef.doc(paperKey);
            const paperData = {
                exam: metadata.exam,
                year: Number(metadata.year),
                month: metadata.month,
                paper: metadata.paper,
            };
            batch.set(paperDocRef, paperData, { merge: true });

            const appearanceDocRef = appearancesRef.doc(appearanceId);
            const appearanceData = {
                paperKey: paperKey,
                questionId: questionId,
                questionNumber: question.questionNumber,
                questionText: question.questionText,
                marks: typeof question.marks === 'number' ? question.marks : 0,
                marksDistribution: typeof question.marksDistribution === 'string' ? question.marksDistribution : "",
                topic: typeof question.topic === 'string' ? question.topic : "Untagged",
            };
            batch.set(appearanceDocRef, appearanceData);
        }

        await batch.commit();

        res.status(200).json({
            message: "Save operation completed successfully.",
            newQuestionsAdded: newQuestionsAdded,
            existingQuestionsUpdated: existingQuestionsUpdated,
        });

    } catch (error) {
        console.error("Error saving questions:", error);
        res.status(500).json({ error: "An error occurred while saving questions." });
    }
});

export default router;