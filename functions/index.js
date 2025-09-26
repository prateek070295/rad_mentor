// functions/index.js

import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import express from "express";
import cors from "cors";

import socraticTutorRouter from "./routes/socraticTutor.js";
import structureGenerator from './routes/structureGenerator.js'; 
import adminSave from './routes/adminSave.js';
import generateMcqRouter from "./routes/generateMcq.js";
import generateTheoryRouter from "./routes/generateTheory.js";
import extractQuestionsRouter from "./routes/extractQuestions.js";
import saveQuestionsRouter from "./routes/saveQuestions.js";
import tutorStepRouter from './routes/tutorStep.js';
import getContentRouter from './routes/getContent.js';

import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getApps, initializeApp } from "firebase-admin/app";

setGlobalOptions({ region: "asia-south1" });
if (!getApps().length) {
 initializeApp();
}

const db = getFirestore();

const app = express();
app.use(cors({ origin: true }));

app.get('/tutor/messages/:topicId', async (req, res) => {
    let userId;
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) throw new Error('Unauthorized');
        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await getAuth().verifyIdToken(idToken);
        userId = decodedToken.uid;
    } catch (error) {
        return res.status(401).json({ error: 'Authentication required.' });
    }

    try {
        const { topicId } = req.params;
        
        // THE FIX: Changed 'topics' to 'sessions' to match where messages are saved.
        const messagesRef = db.collection(`userProgress/${userId}/sessions/${topicId}/messages`);
        
        const snapshot = await messagesRef.orderBy('timestamp', 'desc').limit(20).get();

        if (snapshot.empty) {
            return res.json({ messages: [] });
        }
        
        const messages = snapshot.docs.map(doc => doc.data()).reverse();
        res.json({ messages });

    } catch (error) {
        console.error(`Error fetching messages for user ${userId}, topic ${req.params.topicId}:`, error);
        res.status(500).json({ error: 'Failed to retrieve message history.' });
    }
});

app.use("/chat", socraticTutorRouter);
app.use("/generate-mcq-test", generateMcqRouter);
app.use("/generate-theory-test", generateTheoryRouter);
app.use("/extract-questions", extractQuestionsRouter);
app.use("/save-questions", saveQuestionsRouter);
app.use("/structure", structureGenerator); 
app.use("/admin/save", adminSave);
app.use('/tutor/step', tutorStepRouter);
app.use('/content', getContentRouter);

app.use((err, req, res, _next) => {
  console.error("Global error:", err);
  if (!res.headersSent)
    res.status(500).json({ step: "global", error: String(err?.message || err) });
});

export const api = onRequest({ secrets: ["GEMINI_API_KEY"] }, app);
export { mirrorStudyItem } from "./triggers/mirrorStudyItem.js";
export { backfillStudyItems } from "./scripts/backfillStudyItems.js";
