import express from "express";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const router = express.Router();
const getDb = () => getFirestore();

const ensureAuthenticated = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required." });
    }
    const token = authHeader.split("Bearer ")[1];
    const decoded = await getAuth().verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch (error) {
    console.error("Failed to authenticate request for test data:", error);
    res.status(401).json({ error: "Authentication required." });
  }
};

router.use(ensureAuthenticated);

router.get("/papers", async (_req, res) => {
  try {
    const db = getDb();
    const snapshot = await db.collection("papers").get();
    const papers = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json({ papers });
  } catch (error) {
    console.error("Error fetching test papers:", error);
    res.status(500).json({ error: "Failed to fetch papers." });
  }
});

router.get("/topics", async (_req, res) => {
  try {
    const db = getDb();
    const snapshot = await db
      .collection("questionTopics")
      .orderBy("name")
      .get();
    const topics = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json({ topics });
  } catch (error) {
    console.error("Error fetching question topics:", error);
    res.status(500).json({ error: "Failed to fetch question topics." });
  }
});

router.get("/topic-questions", async (req, res) => {
  const { topicId } = req.query;
  if (!topicId) {
    return res
      .status(400)
      .json({ error: "Missing required topicId query parameter." });
  }

  try {
    const db = getDb();
    const snapshot = await db
      .collection("questions")
      .where("topic", "==", topicId)
      .get();
    const questions = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json({ questions });
  } catch (error) {
    console.error(`Error fetching questions for topic ${topicId}:`, error);
    res.status(500).json({ error: "Failed to fetch topic questions." });
  }
});

router.get("/paper-questions", async (req, res) => {
  const { paperKey } = req.query;
  if (!paperKey) {
    return res
      .status(400)
      .json({ error: "Missing required paperKey query parameter." });
  }

  try {
    const db = getDb();
    const appearancesQuery = await db
      .collection("paperAppearances")
      .where("paperKey", "==", paperKey)
      .orderBy("questionNumber")
      .get();

    if (appearancesQuery.empty) {
      return res.json({ questions: [] });
    }

    const questions = [];
    const repeatCounts = new Map();
    const uniqueQuestionIds = [];

    appearancesQuery.forEach((doc) => {
      const data = doc.data();
      questions.push({ id: doc.id, ...data });
      if (data.questionId && !repeatCounts.has(data.questionId)) {
        repeatCounts.set(data.questionId, 0);
        uniqueQuestionIds.push(data.questionId);
      }
    });

    const chunkSize = 10;
    for (let index = 0; index < uniqueQuestionIds.length; index += chunkSize) {
      const chunk = uniqueQuestionIds.slice(index, index + chunkSize);
      const countsSnapshot = await db
        .collection("paperAppearances")
        .where("questionId", "in", chunk)
        .get();
      countsSnapshot.forEach((doc) => {
        const { questionId } = doc.data();
        if (!questionId) return;
        repeatCounts.set(questionId, (repeatCounts.get(questionId) || 0) + 1);
      });
    }

    const enriched = questions.map((question) => ({
      ...question,
      repeatCount: repeatCounts.get(question.questionId) || 1,
    }));

    res.json({ questions: enriched });
  } catch (error) {
    console.error(`Error fetching paper questions for key ${paperKey}:`, error);
    res.status(500).json({ error: "Failed to fetch paper questions." });
  }
});

export default router;
