import express from "express";
import { getFirestore } from "firebase-admin/firestore";

const router = express.Router();

function normalizeText(text) {
  if (!text) return '';
  return text.toLowerCase().replace(/\[[^\]]*\]/g, '').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

router.post("/", express.json(), async (req, res) => {
    const db = getFirestore();
    try {
        const { questions, metadata } = req.body;
        const uid = req.auth?.uid;

        if (!questions || !metadata || !Array.isArray(questions)) {
            return res.status(400).json({ error: "Invalid request body." });
        }

        const questionBankRef = db.collection("questionBank");
        const batch = db.batch();
        let addedCount = 0;
        let existingCount = 0;

        await Promise.all(questions.map(async (question) => {
            const questionFingerprint = normalizeText(question.questionText);
            const q = questionBankRef.where("questionFingerprint", "==", questionFingerprint);
            const querySnapshot = await q.get();

            if (querySnapshot.empty) {
                const newQuestionRef = questionBankRef.doc();
                const dataToSave = {
                    ...question,
                    ...metadata,
                    // ✅ **FIX**: Ensure the year is always saved as a number for consistency
                    year: Number(metadata.year), 
                    questionFingerprint,
                    topic: question.topic.replace(/\s/g, ''),
                    createdAt: new Date(),
                    uploaderId: uid || 'admin-user',
                };
                batch.set(newQuestionRef, dataToSave);
                addedCount++;
            } else {
                existingCount++;
            }
        }));

        await batch.commit();

        res.status(200).json({
            message: "Save operation completed.",
            totalQuestionsReceived: questions.length,
            newQuestionsAdded: addedCount,
            duplicatesSkipped: existingCount,
        });

    } catch (error) {
        console.error("Error saving questions:", error);
        res.status(500).json({ error: "An error occurred while saving questions." });
    }
});

export default router;