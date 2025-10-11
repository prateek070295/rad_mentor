// functions/scripts/seedAchievements.js
import { onRequest } from "firebase-functions/v2/https";
import { getApp, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { ACHIEVEMENT_DEFINITIONS } from "../achievements/definitions.js";

try {
  getApp();
} catch {
  initializeApp();
}

const db = getFirestore();

export const seedAchievements = onRequest(
  { region: "asia-south1", timeoutSeconds: 300 },
  async (req, res) => {
    try {
      const expectedKey =
        process.env.ACHIEVEMENTS_SEED_KEY ||
        process.env.ACHIEVEMENT_SEED_KEY ||
        "";
      if (expectedKey) {
        const providedKey = req.query.key || req.headers["x-seed-key"];
        if (providedKey !== expectedKey) {
          return res.status(403).json({ ok: false, error: "Forbidden" });
        }
      }

      const dryRun =
        req.query.dryRun === "true" || req.query.preview === "true";

      const collectionRef = db.collection("achievements_definitions");
      const results = [];

      for (const definition of ACHIEVEMENT_DEFINITIONS) {
        const ref = collectionRef.doc(definition.id);
        if (dryRun) {
          results.push({
            id: definition.id,
            action: "preview",
            data: definition,
          });
          continue;
        }

        const snapshot = await ref.get();
        const payload = {
          ...definition,
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (!snapshot.exists) {
          payload.createdAt = FieldValue.serverTimestamp();
        }
        await ref.set(payload, { merge: true });
        results.push({
          id: definition.id,
          action: snapshot.exists ? "updated" : "created",
        });
      }

      res.json({
        ok: true,
        dryRun,
        count: results.length,
        results,
      });
    } catch (error) {
      console.error("seedAchievements error:", error);
      res.status(500).json({
        ok: false,
        error: String(error?.message || error),
      });
    }
  },
);

