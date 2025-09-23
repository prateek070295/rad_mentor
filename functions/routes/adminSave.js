import express from "express";
import { getFirestore } from "firebase-admin/firestore";

const router = express.Router();

const contentSectionsCol = (db, organ, topicId) => {
  const nodeRef = db.collection('sections').doc(organ).collection('nodes').doc(topicId);
  return nodeRef.collection('contentSections');
};

router.post("/", express.json(), async (req, res) => {
  const db = getFirestore();
  const { organ, topicId, structured } = req.body;

  if (!organ || !topicId || !structured) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const batch = db.batch();
    const nodeRef = db.collection('sections').doc(organ).collection('nodes').doc(topicId);
    const csColRef = nodeRef.collection('contentSections');

    // --- NEW: Update the parent node with objectives and key points ---
    batch.update(nodeRef, {
        objectives: structured.objectives || [],
        key_points: structured.key_points || []
    });

    // Step 1 - Delete all existing contentSections to prevent duplicates
    const existingDocsSnapshot = await csColRef.get();
    if (!existingDocsSnapshot.empty) {
      for (const doc of existingDocsSnapshot.docs) {
        // We must also delete the nested 'checkpoints' subcollection for each section.
        // A simple batch delete of the parent doesn't do this automatically.
        const checkpointsRef = doc.ref.collection('checkpoints');
        const checkpointsSnapshot = await checkpointsRef.get();
        if (!checkpointsSnapshot.empty) {
          checkpointsSnapshot.docs.forEach(cpDoc => batch.delete(cpDoc.ref));
        }
        batch.delete(doc.ref);
      }
    }

    // Step 2 - Add the new, edited sections
    if (structured.sections && structured.sections.length > 0) {
      for (const section of structured.sections) {
        const { checkpoints, ...sectionData } = section;
        const secRef = csColRef.doc(); // Auto-generate a new ID

        batch.set(secRef, sectionData);

        if (checkpoints && checkpoints.length > 0) {
          const cpColRef = secRef.collection('checkpoints');
          for (const checkpoint of checkpoints) {
            const cpRef = cpColRef.doc(); // Auto-generate a new ID
            batch.set(cpRef, checkpoint);
          }
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