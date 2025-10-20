// functions/index.js

import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pino from "pino";
import { AsyncLocalStorage } from "node:async_hooks";
import asyncHandler from "./middleware/asyncHandler.js";

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
import { getFirestore, Query, DocumentReference, CollectionReference, WriteBatch } from 'firebase-admin/firestore';
import { getApps, initializeApp } from "firebase-admin/app";

import { recomputeStudyMinutes } from "./scripts/recomputeStudyMinutes.js";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: ["req.headers.authorization", "req.body.password"],
});

const requestStore = new AsyncLocalStorage();

const recordFirestoreTiming = (durationMs) => {
  const store = requestStore.getStore();
  if (store && Array.isArray(store.firestoreTimings)) {
    store.firestoreTimings.push(durationMs);
  }
};

const instrumentAsyncMethod = (prototype, methodName) => {
  const original = prototype?.[methodName];
  if (typeof original !== "function") return;
  prototype[methodName] = async function instrumentedMethod(...args) {
    const start = process.hrtime.bigint();
    try {
      return await original.apply(this, args);
    } finally {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      recordFirestoreTiming(durationMs);
    }
  };
};

instrumentAsyncMethod(Query.prototype, "get");
instrumentAsyncMethod(DocumentReference.prototype, "get");
instrumentAsyncMethod(DocumentReference.prototype, "set");
instrumentAsyncMethod(DocumentReference.prototype, "update");
instrumentAsyncMethod(DocumentReference.prototype, "delete");
instrumentAsyncMethod(CollectionReference.prototype, "add");
instrumentAsyncMethod(WriteBatch.prototype, "commit");

const authenticateRequest = async (req) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new Error("Authentication required.");
    }
    const idToken = authHeader.slice("Bearer ".length);
    const decodedToken = await getAuth().verifyIdToken(idToken);
    return decodedToken.uid;
  } catch (error) {
    const authError = new Error("Authentication required.");
    authError.statusCode = 401;
    throw authError;
  }
};


setGlobalOptions({ region: "asia-south1" });
if (!getApps().length) {
 initializeApp();
}

const db = getFirestore();

const app = express();

const allowedOrigins = new Set([
  "https://radmentor-app.web.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.has(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  }),
);

const aiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use((req, res, next) => {
  const requestStart = process.hrtime.bigint();
  requestStore.run({ firestoreTimings: [] }, () => {
    const store = requestStore.getStore();
    res.on("finish", () => {
      const totalDuration =
        Number(process.hrtime.bigint() - requestStart) / 1e6;
      const timings = store?.firestoreTimings ?? [];
      const avgFirestore =
        timings.length > 0
          ? timings.reduce((sum, value) => sum + value, 0) / timings.length
          : 0;

      logger.info({
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Number(totalDuration.toFixed(2)),
        firestoreCalls: timings.length,
        avgFirestoreMs: Number(avgFirestore.toFixed(2)),
      });
    });
    res.on("error", (err) => {
      logger.error(
        { err, method: req.method, path: req.originalUrl },
        "request.error",
      );
    });
    next();
  });
});

app.use("/chat", aiLimiter);
app.use("/generate-mcq-test", aiLimiter);
app.use("/generate-theory-test", aiLimiter);

app.get('/tutor/messages/:topicId', asyncHandler(async (req, res) => {
  const userId = await authenticateRequest(req);
  const { topicId } = req.params;

  const messagesRef = db.collection(
    `userProgress/${userId}/sessions/${topicId}/messages`,
  );
  const snapshot = await messagesRef.orderBy('timestamp', 'desc').limit(20).get();

  if (snapshot.empty) {
    return res.json({ messages: [] });
  }

  const messages = snapshot.docs.map((doc) => doc.data()).reverse();
  res.json({ messages });
}));

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

app.get('/tutor/session-stats/:topicId', asyncHandler(async (req, res) => {
  const userId = await authenticateRequest(req);
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

  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    logger.warn(
      { userId, topicId },
      'session-stats: session document missing',
    );
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
}));

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
  logger.error(
    { err, method: req.method, path: req.originalUrl },
    "Global error",
  );
  if (res.headersSent) {
    return;
  }
  const statusCode = err?.statusCode || err?.status || 500;
  res
    .status(statusCode)
    .json({ step: "global", error: String(err?.message || err) });
});

export const api = onRequest({ secrets: ["GEMINI_API_KEY"] }, app);
export { mirrorStudyItem } from "./triggers/mirrorStudyItem.js";
export { onStudySessionWrite } from "./triggers/achievementsStudySession.js";
export { backfillStudyItems } from "./scripts/backfillStudyItems.js";
export { recomputeStudyMinutes };
export { seedAchievements } from "./scripts/seedAchievements.js";
