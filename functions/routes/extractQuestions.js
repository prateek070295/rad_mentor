import { getGenAI } from "../helpers.js";
import express from "express";
import Busboy from "busboy";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const router = express.Router();

// This helper function safely extracts text from a PDF buffer using pdf.js
async function getTextFromPdf(buffer) {
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
    const pdf = await loadingTask.promise;
    let allText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        allText += textContent.items.map(item => item.str).join(" ");
        allText += "\n"; // Add a newline for each page
    }
    return allText;
}

function safeJsonParseMaybeArray(text) {
  const cleaned = (text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch {}
  }
  try { return JSON.parse(cleaned); } catch { return []; }
}

router.post("/", (req, res) => {
  if (!req.headers["content-type"]?.includes("multipart/form-data")) {
    return res.status(415).json({ step: "upload", error: "Request must be multipart/form-data." });
  }

  const busboy = Busboy({ headers: req.headers, limits: { fileSize: 25 * 1024 * 1024 } });
  const chunks = [];
  let gotFile = false;
  let mimeType = "";

  busboy.on("file", (fieldname, fileStream, {mimeType: fileMimeType}) => {
    if (fieldname !== "file") return fileStream.resume();
    gotFile = true;
    mimeType = fileMimeType;
    fileStream.on("limit", () => res.status(413).json({ step: "upload", error: "File exceeds 25MB size limit." }));
    fileStream.on("data", (c) => chunks.push(c));
  });

  busboy.on("finish", async () => {
    try {
      if (!gotFile || chunks.length === 0) {
        return res.status(400).json({ step: "upload", error: "No file was uploaded." });
      }
      if (mimeType !== "application/pdf") {
        return res.status(415).json({ step: "upload", error: "Only PDF files are supported." });
      }

      const fileBuffer = Buffer.concat(chunks);
      
      const rawText = await getTextFromPdf(fileBuffer);
      
      if (!rawText.trim()) {
        return res.status(422).json({ step: "pdf-parse", error: "No text content could be extracted using pdf.js." });
      }

      const genAI = getGenAI();
      if (!genAI) return res.status(500).json({ step: "ai-init", error: "GEMINI_API_KEY not configured" });
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

      const extractionPrompt = `
        Extract exam questions and their marks from the text below.
        Return STRICT JSON array only: [{"questionText":"...","marks":10}]
        If marks are absent, use 0. Ignore metadata. Focus only on the numbered questions.
        Text:\n${rawText}`.trim();

      const ex = await model.generateContent(extractionPrompt);
      const extractedQuestions = safeJsonParseMaybeArray(ex.response.text());
      if (!Array.isArray(extractedQuestions) || extractedQuestions.length === 0) {
        return res.status(422).json({ step: "ai-extract", error: "AI failed to extract questions from the text." });
      }

      const taggingPrompt = `
        Given these questions (with marks), assign ONE topic from the list.
        The list is: ["Breast","Cardiovascular","Chest","GIT","Genitourinary","HeadNeckFace","Hepatobiliary_Pancreas_Spleen_Abdominal_Trauma","Musculoskeletal","Neuroradiology","Pediatrics","Physics"].
        Return a STRICT JSON array with the original question, its marks, and the assigned topic:
        [{ "questionText": string, "marks": number, "topic": string }]
        Questions:\n${JSON.stringify(extractedQuestions)}`.trim();

      const tg = await model.generateContent(taggingPrompt);
      const finalQuestions = safeJsonParseMaybeArray(tg.response.text());
      if (!Array.isArray(finalQuestions) || finalQuestions.length === 0) {
        return res.status(422).json({ step: "ai-tag", error: "AI failed to tag the extracted questions." });
      }

      const stamped = finalQuestions.map(q => ({
        questionText: q.questionText,
        marks: Number.isFinite(q.marks) ? q.marks : 0,
        topic: q.topic,
        extractedAt: new Date().toISOString(),
      }));

      return res.status(200).json(stamped);
    } catch (e) {
      console.error("Error during processing:", e);
      const step = e.message.includes("PDF") ? "pdf-parse" : "server";
      return res.status(500).json({ step, error: String(e?.message || e) });
    }
  });

  busboy.on("error", (err) => res.status(400).json({ step: "upload-stream", error: "Error parsing the upload stream." }));
  busboy.end(req.rawBody);
});

export default router;