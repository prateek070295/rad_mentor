import { getGenAI, runWithRetry } from "../helpers.js";
import express from "express";
import Busboy from "busboy";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import requireAdmin from "../middleware/auth.js";
import truncateText from "../utils/truncateText.js";

const router = express.Router();

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

async function getTextFromPdf(buffer) {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  let allText = "";
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    const sortedItems = textContent.items.sort((a, b) => {
      if (a.transform[5] > b.transform[5]) return -1;
      if (a.transform[5] < b.transform[5]) return 1;
      return a.transform[4] - b.transform[4];
    });

    allText += sortedItems.map((item) => item.str).join(" ");
    allText += "\n\n";
  }
  return allText;
}

const parsePdfUpload = (req) =>
  new Promise((resolve, reject) => {
    const busboy = Busboy({
      headers: req.headers,
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    });

    const chunks = [];
    let gotFile = false;
    let mimeType = "";
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    busboy.on("file", (fieldname, fileStream, info = {}) => {
      if (fieldname !== "file") {
        fileStream.resume();
        return;
      }

      gotFile = true;
      mimeType = info.mimeType || info.mimetype || "";
      fileStream.on("data", (chunk) => {
        chunks.push(chunk);
      });
      fileStream.on("limit", () => {
        fileStream.removeAllListeners("data");
        fileStream.resume();
        fail(
          Object.assign(new Error("File exceeds 25MB size limit."), {
            statusCode: 413,
            step: "upload",
          }),
        );
      });
      fileStream.on("error", (streamErr) =>
        fail(Object.assign(streamErr, { step: "upload-stream" })),
      );
    });

    busboy.on("error", (err) =>
      fail(Object.assign(err, { step: "upload-stream" })),
    );

    busboy.on("finish", () => {
      if (settled) return;
      settled = true;
      if (!gotFile || chunks.length === 0) {
        reject(
          Object.assign(new Error("No file was uploaded."), {
            statusCode: 400,
            step: "upload",
          }),
        );
        return;
      }

      resolve({
        buffer: Buffer.concat(chunks),
        mimeType,
      });
    });

    req.pipe(busboy);
  });

router.post("/", requireAdmin, async (req, res) => {
  if (!req.headers["content-type"]?.includes("multipart/form-data")) {
    return res
      .status(415)
      .json({ step: "upload", error: "Request must be multipart/form-data." });
  }

  let upload;
  try {
    upload = await parsePdfUpload(req);
  } catch (parseError) {
    const status = parseError?.statusCode || 400;
    const step = parseError?.step || "upload";
    return res
      .status(status)
      .json({ step, error: parseError?.message || "Upload failed." });
  }

  if (upload.mimeType !== "application/pdf") {
    return res
      .status(415)
      .json({ step: "upload", error: "Only PDF files are supported." });
  }

  try {
    const rawText = await getTextFromPdf(upload.buffer);
    if (!rawText.trim()) {
      return res
        .status(422)
        .json({ step: "pdf-parse", error: "No text content could be extracted." });
    }
    const truncatedPdfText = truncateText(rawText);

    const genAI = getGenAI();
    if (!genAI) {
      return res
        .status(500)
        .json({ step: "ai-init", error: "GEMINI_API_KEY not configured" });
    }

    const model = genAI.getGenerativeModel(
      { model: "models/gemini-2.0-flash-lite-001" },
      { apiVersion: "v1" },
    );

    const extractionPrompt = `
        You are an expert at parsing medical exam papers. Your task is to extract all questions, their number, total marks, and mark distribution.

        INSTRUCTIONS:
        1. Identify each main question, which is typically numbered (e.g., "1.", "2."). Capture this number.
        2. If a question has sub-parts (e.g., "a)", "b)"), combine them into a single 'questionText'.
        3. The 'marks' field should be the total marks (e.g., for "[7+3]", marks are 10).
        4. The 'marksDistribution' field should be the string inside the brackets (e.g., "7+3").
        5. Return a STRICT JSON array only. Each object must have 'questionNumber', 'questionText', 'marks', and 'marksDistribution'.

        EXAMPLE:
        Input Text: "2. a) Describe X. b) Discuss Y. [4+6]"
        Output JSON:
        [
          {
            "questionNumber": 2,
            "questionText": "a) Describe X.\nb) Discuss Y.",
            "marks": 10,
            "marksDistribution": "4+6"
          }
        ]

        Text to Parse:
        ${truncatedPdfText}`.trim();

    const exResult = await runWithRetry(() => model.generateContent(extractionPrompt));
    const extractedQuestions = JSON.parse(exResult.response.text());

    if (!Array.isArray(extractedQuestions) || extractedQuestions.length === 0) {
      return res
        .status(422)
        .json({ step: "ai-extract", error: "AI failed to extract questions from the text." });
    }

    const questionsJson = JSON.stringify(extractedQuestions, null, 2);
    const taggingPrompt = `
        Given these questions, assign ONE topic from the list.
        The list is: ["Breast","Cardiovascular","Chest","GIT","Genitourinary","HeadNeckFace","Hepatobiliary_Pancreas_Spleen_Abdominal_Trauma","Musculoskeletal","Neuroradiology","Obs&Gyn","Pediatrics","Physics","Recent_Advances"].
        Return a STRICT JSON array with all original data plus the assigned topic:
        [{ "questionNumber": number, "questionText": string, "marks": number, "marksDistribution": string, "topic": string }]
        Questions:\n${truncateText(questionsJson)}`.trim();

    const tgResult = await runWithRetry(() => model.generateContent(taggingPrompt));
    const finalQuestions = JSON.parse(tgResult.response.text());

    if (!Array.isArray(finalQuestions) || finalQuestions.length === 0) {
      return res
        .status(422)
        .json({ step: "ai-tag", error: "AI failed to tag the extracted questions." });
    }

    const stamped = finalQuestions.map((q) => ({
      questionNumber: q.questionNumber || 0,
      questionText: q.questionText,
      marks: Number.isFinite(q.marks) ? q.marks : 0,
      marksDistribution: q.marksDistribution || "",
      topic: q.topic,
      extractedAt: new Date().toISOString(),
    }));

    return res.status(200).json(stamped);
  } catch (error) {
    console.error("Error during processing:", error);
    if (error?.status === 503 || error?.status === 429) {
      return res
        .status(503)
        .json({ step: "ai", error: "Our AI tutor is busy. Please try again in a few seconds." });
    }
    return res
      .status(500)
      .json({ step: "server", error: String(error?.message || error) });
  }
});

export default router;
