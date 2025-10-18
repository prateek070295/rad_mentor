import express from "express";
import { getFirestore } from "firebase-admin/firestore";

const router = express.Router();

const COLLECTION_NAMES = ["achievements_definitions", "achievements_defninition"];

router.get("/definitions", async (_req, res) => {
  try {
    const db = getFirestore();
    let docs = [];
    let activeCollection = null;

    for (const name of COLLECTION_NAMES) {
      try {
        const snap = await db.collection(name).orderBy("sortOrder", "asc").get();
        if (!snap.empty) {
          docs = snap.docs;
          activeCollection = name;
          break;
        }
      } catch (collectionError) {
        console.error(`Failed to load ${name}:`, collectionError);
      }
    }

    if (!docs.length) {
      return res.json({ definitions: [] });
    }

    const definitions = docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() || {}),
    }));

    if (activeCollection && activeCollection !== COLLECTION_NAMES[0]) {
      console.warn(
        `Definitions served from fallback collection "${activeCollection}". Consider consolidating into "${COLLECTION_NAMES[0]}".`,
      );
    }

    res.json({ definitions });
  } catch (error) {
    console.error("Error loading achievement definitions:", error);
    res.status(500).json({ error: "Failed to load achievement definitions." });
  }
});

export default router;
