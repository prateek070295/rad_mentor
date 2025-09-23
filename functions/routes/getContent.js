import express from "express";
import { getFirestore } from "firebase-admin/firestore";

const router = express.Router();

router.get("/", async (req, res) => {
    const db = getFirestore();
    const { organ, topicId } = req.query;

    if (!organ || !topicId) {
        return res.status(400).json({ error: "Missing required query parameters: organ and topicId" });
    }

    try {
        const nodeRef = db.collection('sections').doc(organ).collection('nodes').doc(topicId);
        const sectionsRef = nodeRef.collection('contentSections');

        // 1. Get the parent node document to fetch the top-level objectives and key points.
        // We assume they are stored on the main node document.
        const nodeSnap = await nodeRef.get();
        if (!nodeSnap.exists) {
            // If the main topic node doesn't exist, we can't load anything.
            return res.status(404).json({ message: "Topic node not found." });
        }
        const nodeData = nodeSnap.data();

        // 2. Get all the contentSection documents for this topic, ordered by their 'order' field.
        const sectionsQuery = sectionsRef.orderBy('order', 'asc');
        const sectionsSnapshot = await sectionsQuery.get();

        // If there are no content sections, it means none have been generated yet.
        // We return an empty `structuredContent` so the frontend knows to show the "Generate" view.
        if (sectionsSnapshot.empty) {
            return res.status(200).json({ structuredContent: null });
        }

        const sections = [];

        // 3. For each section, we also need to fetch its nested checkpoints.
        for (const sectionDoc of sectionsSnapshot.docs) {
            const sectionData = sectionDoc.data();
            const checkpointsRef = sectionDoc.ref.collection('checkpoints');
            const checkpointsSnapshot = await checkpointsRef.get(); // Get all checkpoints for the section

            const checkpoints = checkpointsSnapshot.docs.map(doc => doc.data());
            
            sections.push({
                ...sectionData,
                checkpoints: checkpoints,
                id: sectionDoc.id // Pass the section's document ID to the frontend
            });
        }
        
        // 4. Assemble the final, complete structured content object.
        const structuredContent = {
            objectives: nodeData.objectives || [], // Default to an empty array if not present
            sections: sections,
            key_points: nodeData.key_points || []  // Default to an empty array if not present
        };
        
        res.status(200).json({ structuredContent });

    } catch (error) {
        console.error("Error fetching content:", error);
        res.status(500).json({ error: "Failed to fetch structured content." });
    }
});

export default router;
