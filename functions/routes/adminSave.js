// file: functions/routes/adminSave.js

import express from "express";
// Corrected import: We only need getFirestore from the top level.
import { getFirestore } from "firebase-admin/firestore";

const router = express.Router();

router.post("/", express.json(), async (req, res) => {
  const db = getFirestore();
  const { organ, topicId, structured } = req.body;

  if (!organ || !topicId || !structured || !structured.sections) {
    return res.status(400).json({ error: "Missing required fields: organ, topicId, and structured content are required." });
  }

  try {
    // Correct: Get a batch object from the db instance.
    const batch = db.batch();

    // Correct: Build the path using chained .collection() and .doc() methods.
    const nodeRef = db.collection('sections').doc(organ).collection('nodes').doc(topicId);
    const csColRef = nodeRef.collection('contentSections');

    for (const section of structured.sections) {
      const { checkpoints, ...sectionData } = section;
      
      // Correct: Call .doc() on the collection reference to auto-generate an ID.
      const secRef = csColRef.doc();

      batch.set(secRef, {
        ...sectionData,
        requires_image_ack: !!(section.images && section.images.length > 0),
        requires_case_ack: !!(section.cases && section.cases.length > 0),
      });

      if (checkpoints && checkpoints.length > 0) {
        // Correct: Call .collection() on the document reference for the subcollection.
        const cpColRef = secRef.collection('checkpoints');
        for (const checkpoint of checkpoints) {
          // Correct: Call .doc() on the subcollection reference.
          const cpRef = cpColRef.doc();
          batch.set(cpRef, checkpoint);
        }
      }
    }

    await batch.commit();
    res.status(200).json({ message: "Content saved successfully." });

  } catch (error) {
    console.error("Error saving structured content:", error);
    res.status(500).json({ error: "Failed to save content to the database." });
  }
});

export default router;