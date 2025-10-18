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
import testDataRouter from './routes/testData.js';
import achievementsRouter from './routes/achievements.js';

import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getApps, initializeApp } from "firebase-admin/app";

import { recomputeStudyMinutes } from "./scripts/recomputeStudyMinutes.js";


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

const extractMetricsMap = (sessionData = {}) => {
    const metrics = {};
    if (sessionData.metrics && typeof sessionData.metrics === 'object' && !Array.isArray(sessionData.metrics)) {
        Object.entries(sessionData.metrics).forEach(([key, value]) => {
            if (value && typeof value.toDate === 'function') {
                metrics[key] = value;
            } else {
                metrics[key] = value;
            }
        });
    }
    Object.entries(sessionData).forEach(([key, value]) => {
        if (!key.startsWith('metrics.')) return;
        const metricKey = key.slice('metrics.'.length);
        if (metrics[metricKey] === undefined) {
            metrics[metricKey] = value;
        }
    });
    return metrics;
};

app.get('/tutor/session-stats/:topicId', async (req, res) => {
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

    const { topicId } = req.params;
    if (!topicId) {
        return res.status(400).json({ error: 'topicId is required.' });
    }

    const sessionRef = db.doc(`userProgress/${userId}/sessions/${topicId}`);
    const eventsRef = sessionRef.collection('events');

    const toNumber = (value, fallback = 0) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    };

    const serializeTimestamp = (value) => {
        if (!value) return null;
        if (typeof value.toDate === 'function') {
            return value.toDate().toISOString();
        }
        if (value instanceof Date) {
            return value.toISOString();
        }
        if (typeof value === 'string' || typeof value === 'number') {
            return new Date(value).toISOString();
        }
        return null;
    };

    try {
        const sessionSnap = await sessionRef.get();
        if (!sessionSnap.exists) {
            console.warn(`session-stats: session doc missing for user ${userId}, topic ${topicId}`);
            return res.status(404).json({ error: 'Session not found.' });
        }

        const sessionData = sessionSnap.data() || {};
        const metricsRaw = extractMetricsMap(sessionData);

        const eventsSnap = await eventsRef.orderBy('createdAt', 'asc').limit(200).get();
        const events = [];
        let firstEventMillis = null;
        let lastEventMillis = null;

        eventsSnap.forEach((doc) => {
            const data = doc.data() || {};
            const createdAt =
                data.createdAt && typeof data.createdAt.toMillis === 'function'
                    ? data.createdAt.toMillis()
                    : null;
            if (createdAt != null) {
                if (firstEventMillis == null || createdAt < firstEventMillis) {
                    firstEventMillis = createdAt;
                }
                if (lastEventMillis == null || createdAt > lastEventMillis) {
                    lastEventMillis = createdAt;
                }
            }
            events.push({
                id: doc.id,
                type: data.type || null,
                uiType: data.uiType || null,
                durationMs: toNumber(data.durationMs, null),
                phaseBefore: data.phaseBefore || null,
                phaseAfter: data.phaseAfter || null,
                userInputType: data.userInputType || null,
                userInputSummary: data.userInputSummary || null,
                previousAssistantUiType: data.previousAssistantUiType || null,
                sessionStateVersion: toNumber(data.sessionStateVersion, null),
                sessionCompleted: data.sessionCompleted === true,
                createdAt: createdAt != null ? new Date(createdAt).toISOString() : null,
                relativeMs: null,
            });
        });

        if (firstEventMillis != null) {
            events.forEach((event) => {
                if (event.createdAt) {
                    const eventMillis = Date.parse(event.createdAt);
                    if (Number.isFinite(eventMillis)) {
                        event.relativeMs = Math.max(0, eventMillis - firstEventMillis);
                    }
                }
            });
        }

        const totalUserThinkMs = toNumber(metricsRaw.totalUserThinkMs);
        const totalAiResponseMs = toNumber(metricsRaw.totalAiResponseMs);
        const userResponseCount = toNumber(metricsRaw.userResponseCount);
        const aiResponseCount = toNumber(metricsRaw.aiResponseCount);

        const averageUserThinkMs =
            userResponseCount > 0 ? Math.round(totalUserThinkMs / userResponseCount) : null;
        const averageAiResponseMs =
            aiResponseCount > 0 ? Math.round(totalAiResponseMs / aiResponseCount) : null;

        const sessionDurationMs =
            firstEventMillis != null && lastEventMillis != null
                ? Math.max(0, lastEventMillis - firstEventMillis)
                : null;

        const sanitizedMetrics = {};
        Object.entries(metricsRaw).forEach(([key, value]) => {
            if (value && typeof value.toDate === 'function') {
                sanitizedMetrics[key] = value.toDate().toISOString();
            } else {
                sanitizedMetrics[key] = value;
            }
        });

        const responsePayload = {
            topicId,
            userId,
            sessionStateVersion: sessionData.sessionStateVersion ?? null,
            updatedAt: serializeTimestamp(sessionData.updatedAt),
            metrics: sanitizedMetrics,
            aggregates: {
                totalUserThinkMs,
                totalAiResponseMs,
                userResponseCount,
                aiResponseCount,
                averageUserThinkMs,
                averageAiResponseMs,
                sessionDurationMs,
                eventCount: events.length,
            },
            events,
        };

        if (sessionData.sessionState) {
            responsePayload.sessionPhase = sessionData.sessionState.phase ?? null;
        }

        if (metricsRaw.sessionStartedAt) {
            responsePayload.sessionStartedAt = serializeTimestamp(metricsRaw.sessionStartedAt);
        }
        if (metricsRaw.sessionCompletedAt) {
            responsePayload.sessionCompletedAt = serializeTimestamp(metricsRaw.sessionCompletedAt);
        }

        res.json(responsePayload);
    } catch (error) {
        console.error(`Error fetching session stats for user ${userId}, topic ${topicId}:`, error);
        res.status(500).json({ error: 'Failed to retrieve session statistics.' });
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
app.use('/tests', testDataRouter);
app.use('/achievements', achievementsRouter);

app.use((err, req, res, _next) => {
  console.error("Global error:", err);
  if (!res.headersSent)
    res.status(500).json({ step: "global", error: String(err?.message || err) });
});

export const api = onRequest({ secrets: ["GEMINI_API_KEY"] }, app);
export { mirrorStudyItem } from "./triggers/mirrorStudyItem.js";
export { onStudySessionWrite } from "./triggers/achievementsStudySession.js";
export { backfillStudyItems } from "./scripts/backfillStudyItems.js";
export { recomputeStudyMinutes };
export { seedAchievements } from "./scripts/seedAchievements.js";
