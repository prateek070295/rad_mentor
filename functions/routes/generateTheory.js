import { getGenAI, convertDeltaToText } from "../helpers.js";
import express from "express";
import { getFirestore } from "firebase-admin/firestore";

// const db = getFirestore(); // This line was removed from here
const router = express.Router();

router.post("/", express.json(), async (req, res) => {
  const db = getFirestore(); // And added here
  try {
    const genAI = getGenAI();
    if (!genAI)
      return res
        .status(500)
        .json({ error: "Gemini API key not configured on server." });

    const { sectionName } = req.body;
    if (!sectionName)
      return res.status(400).json({ error: "sectionName is required." });

    const sectionsRef = db.collection("sections");
    const sectionSnapshot = await sectionsRef
      .where("title", "==", sectionName)
      .get();
    if (sectionSnapshot.empty)
      return res
        .status(404)
        .json({ error: `Section '${sectionName}' not found.` });

    const sectionId = sectionSnapshot.docs[0].id;
    const nodesRef = db.collection("sections").doc(sectionId).collection("nodes");
    const allNodesSnapshot = await nodesRef.get();

    let combinedContent = "";
    allNodesSnapshot.forEach((doc) => {
      const nodeData = doc.data();
      if (nodeData?.mainContent) {
        combinedContent += convertDeltaToText(nodeData.mainContent) + "\n\n";
      }
    });
    if (!combinedContent.trim())
      return res
        .status(404)
        .json({ error: `No study material found for section '${sectionName}'.` });

    const model = genAI.getGenerativeModel(
      { model: "models/gemini-2.0-flash-lite-001" },
      { apiVersion: "v1" }
    );
    const prompt = `
You are an examiner for the DNB Radiodiagnosis theory exam.
Based ONLY on the <Reference_Material>, generate 10 short-note style theory questions.
Respond with ONLY a valid JSON array of objects. Each object should have a single "question" key.
Example:
[
  { "question": "Write a short note on the imaging features of hepatocellular carcinoma." },
  { "question": "Discuss the role of MRI in diagnosing multiple sclerosis." }
]
<Reference_Material>
---
${combinedContent}
---
</Reference_Material>
    `.trim();

    const result = await model.generateContent(prompt);
    const jsonText = result
      .response
      .text()
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const questions = JSON.parse(jsonText);

    res.json({ questions });
  } catch (error) {
    console.error("Error in /api/generate-theory-test endpoint:", error);
    res
      .status(500)
      .json({ error: "Something went wrong while generating the test." });
  }
});

export default router;
