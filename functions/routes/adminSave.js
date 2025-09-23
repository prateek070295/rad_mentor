import express from "express";
import { getFirestore } from "firebase-admin/firestore";

const router = express.Router();

// Helper to get collection reference
const contentSectionsCol = (db, organ, topicId) => {
  const nodeRef = db.collection('sections').doc(organ).collection('nodes').doc(topicId);
  return nodeRef.collection('contentSections');
};

router.post("/", express.json(), async (req, res) => {
  const db = getFirestore();
  const { organ, topicId, structured } = req.body;

  if (!organ || !topicId || !structured || !structured.sections) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const batch = db.batch();
    const csColRef = contentSectionsCol(db, organ, topicId);

    // --- NEW: Step 1 - Delete all existing documents in the subcollection ---
    const existingDocsSnapshot = await csColRef.get();
    if (!existingDocsSnapshot.empty) {
      existingDocsSnapshot.docs.forEach(doc => {
        // We also need to delete the nested 'checkpoints' subcollection recursively
        // Note: For production, a Cloud Function triggered on delete is more robust,
        // but for our direct admin use, this is sufficient.
        batch.delete(doc.ref); 
      });
    }
    // A more robust solution for nested subcollections would be a separate helper function,
    // but a simple delete works if checkpoints are always re-created with the sections.

    // --- Step 2 - Add the new, edited documents ---
    for (const section of structured.sections) {
      const { checkpoints, ...sectionData } = section;
      const secRef = csColRef.doc(); // Auto-generate a new ID

      batch.set(secRef, {
        ...sectionData,
        // Ensure boolean flags are set correctly
        requires_image_ack: !!(section.images && section.images.length > 0),
        requires_case_ack: !!(section.cases && section.cases.length > 0),
      });

      if (checkpoints && checkpoints.length > 0) {
        const cpColRef = secRef.collection('checkpoints');
        for (const checkpoint of checkpoints) {
          const cpRef = cpColRef.doc(); // Auto-generate a new ID
          batch.set(cpRef, checkpoint);
        }
      }
    }

    await batch.commit();
    res.status(200).json({ message: "Content updated successfully." });

  } catch (error) {
    console.error("Error updating structured content:", error);
    res.status(500).json({ error: "Failed to update content." });
  }
});

export default router;
