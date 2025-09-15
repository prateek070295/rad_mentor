import express from "express";
// ✅ **FIX**: Only import getFirestore, as the other functions are not part of the Admin SDK
import { getFirestore } from "firebase-admin/firestore";

const router = express.Router();

router.post("/", express.json(), async (req, res) => {
    const db = getFirestore();
    try {
        const { questions, metadata } = req.body;
        const uid = req.auth?.uid;

        if (!questions || !metadata || !Array.isArray(questions)) {
            return res.status(400).json({ error: "Invalid request body." });
        }

        const questionBankRef = db.collection("questionBank"); // ✅ **FIX**: Use Admin SDK syntax
        const batch = db.batch(); // ✅ **FIX**: Use Admin SDK syntax
        let addedCount = 0;
        let existingCount = 0;

        await Promise.all(questions.map(async (question) => {
            // ✅ **FIX**: Rewrote the query using the chained Admin SDK syntax
            const q = questionBankRef
                .where("questionText", "==", question.questionText)
                .where("exam", "==", metadata.exam)
                .where("year", "==", metadata.year)
                .where("paper", "==", metadata.paper);

            const querySnapshot = await q.get();

            if (querySnapshot.empty) {
                const newQuestionRef = questionBankRef.doc();
                const dataToSave = {
                    ...question,
                    ...metadata,
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