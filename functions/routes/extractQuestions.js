import { getGenAI } from "../helpers.js";
import express from "express";
import Busboy from "busboy";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

const router = express.Router();

async function getTextFromPdf(buffer) {
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
    const pdf = await loadingTask.promise;
    let allText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        const sortedItems = textContent.items.sort((a, b) => {
            if (a.transform[5] > b.transform[5]) return -1;
            if (a.transform[5] < b.transform[5]) return 1;
            return a.transform[4] - b.transform[4];
        });

        allText += sortedItems.map(item => item.str).join(" ");
        allText += "\n\n";
    }
    return allText;
}

router.post("/", (req, res) => {
  if (!req.headers["content-type"]?.includes("multipart/form-data")) {
    return res.status(415).json({ step: "upload", error: "Request must be multipart/form-data." });
  }

  const busboy = Busboy({ headers: req.headers, limits: { fileSize: 25 * 1024 * 1024 } });
  const chunks = [];
  let gotFile = false; let mimeType = "";

  busboy.on("file", (fieldname, fileStream, {mimeType: fileMimeType}) => {
    if (fieldname !== "file") return fileStream.resume();
    gotFile = true; mimeType = fileMimeType;
    fileStream.on("limit", () => res.status(413).json({ step: "upload", error: "File exceeds 25MB size limit." }));
    fileStream.on("data", (c) => chunks.push(c));
  });

  busboy.on("finish", async () => {
    try {
      if (!gotFile || chunks.length === 0) return res.status(400).json({ step: "upload", error: "No file was uploaded." });
      if (mimeType !== "application/pdf") return res.status(415).json({ step: "upload", error: "Only PDF files are supported." });

      const fileBuffer = Buffer.concat(chunks);
      const rawText = await getTextFromPdf(fileBuffer);
      if (!rawText.trim()) return res.status(422).json({ step: "pdf-parse", error: "No text content could be extracted." });

      const genAI = getGenAI();
      if (!genAI) return res.status(500).json({ step: "ai-init", error: "GEMINI_API_KEY not configured" });
      
      const generationConfig = {
        response_mime_type: "application/json",
        temperature: 0.2,
      };
      const model = genAI.getGenerativeModel(
        { model: "models/gemini-1.5-pro", generationConfig },
        { apiVersion: "v1" }
      );
      
      // ✅ **FIX**: Upgraded prompt to include 'questionNumber'
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
            "questionText": "a) Describe X.\\nb) Discuss Y.",
            "marks": 10,
            "marksDistribution": "4+6"
          }
        ]

        Text to Parse:
        ${rawText}`.trim();

      const exResult = await model.generateContent(extractionPrompt);
      const extractedQuestions = JSON.parse(exResult.response.text());

      if (!Array.isArray(extractedQuestions) || extractedQuestions.length === 0) {
        return res.status(422).json({ step: "ai-extract", error: "AI failed to extract questions from the text." });
      }

      // ✅ **FIX**: Pass all new fields to the tagging prompt
      const taggingPrompt = `
        Given these questions, assign ONE topic from the list.
        The list is: ["Breast","Cardiovascular","Chest","GIT","Genitourinary","HeadNeckFace","Hepatobiliary_Pancreas_Spleen_Abdominal_Trauma","Musculoskeletal","Neuroradiology","Obs&Gyn","Pediatrics","Physics","Recent_Advances"].
        Return a STRICT JSON array with all original data plus the assigned topic:
        [{ "questionNumber": number, "questionText": string, "marks": number, "marksDistribution": string, "topic": string }]
        Questions:\n${JSON.stringify(extractedQuestions)}`.trim();

      const tgResult = await model.generateContent(taggingPrompt);
      const finalQuestions = JSON.parse(tgResult.response.text());

      if (!Array.isArray(finalQuestions) || finalQuestions.length === 0) {
        return res.status(422).json({ step: "ai-tag", error: "AI failed to tag the extracted questions." });
      }

      // ✅ **FIX**: Ensure 'questionNumber' is included in the final object
      const stamped = finalQuestions.map(q => ({
        questionNumber: q.questionNumber || 0,
        questionText: q.questionText,
        marks: Number.isFinite(q.marks) ? q.marks : 0,
        marksDistribution: q.marksDistribution || "",
        topic: q.topic,
        extractedAt: new Date().toISOString(),
      }));

      return res.status(200).json(stamped);
    } catch (e) {
      console.error("Error during processing:", e);
      return res.status(500).json({ step: "server", error: String(e?.message || e) });
    }
  });

  busboy.on("error", (err) => res.status(400).json({ step: "upload-stream", error: "Error parsing the upload stream." }));
  busboy.end(req.rawBody);
});

export default router;
