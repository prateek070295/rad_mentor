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
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ---------- Global options / Firebase Admin ----------
setGlobalOptions({ region: "asia-south1" });
initializeApp();
const db = getFirestore();

// ---------- Express app & CORS ----------
const app = express();
app.use(cors({ origin: true }));

// IMPORTANT: Do NOT add global express.json() or other body parsers here.
// They are now handled per-route in the routers themselves.

// ---------- Registering Routes ----------
app.use("/chat", socraticTutorRouter);
app.use("/generate-mcq-test", generateMcqRouter);
app.use("/generate-theory-test", generateTheoryRouter);
app.use("/extract-questions", extractQuestionsRouter);
app.use("/save-questions", saveQuestionsRouter);
app.use("/structure", structureGenerator); 
app.use("/admin/save", adminSave);

// ---------- Global error handler (JSON always) ----------
app.use((err, req, res, _next) => {
  console.error("Global error:", err);
  if (!res.headersSent)
    res.status(500).json({ step: "global", error: String(err?.message || err) });
});

// ---------- Export ----------
// FIX: Added "GEMINI_API_KEY" to the secrets array.
export const api = onRequest({ secrets: ["GEMINI_API_KEY"] }, app);