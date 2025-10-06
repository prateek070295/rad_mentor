import { getGenAI, convertDeltaToText } from "../helpers.js";
import express from "express";
import { getFirestore } from "firebase-admin/firestore";

// const db = getFirestore(); // This line was removed from here
const router = express.Router();

router.post("/", express.json(), async (req, res) => {
  const db = getFirestore(); // And added here
  try {
    const genAI = getGenAI();
    if (!genAI) {
      return res.status(500).json({ error: "Gemini API key not configured on server." });
    }

    const { history, context } = req.body;
    if (!history) return res.status(400).json({ error: "Chat history is required." });

    const plainTextContext = convertDeltaToText(context || {});
    const googleAIHistory = history.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));
    const lastUserMessage = googleAIHistory.pop();

    const model = genAI.getGenerativeModel(
      {
        model: "models/gemini-1.5-flash",
      },
      { apiVersion: "v1" }
    );

    const prompt = `
<Role>
You are Rad Mentor, an expert Socratic tutor for the rad_mentor-app. Your target audience is radiology residents (DNB or MD level).
</Role>
<Context>
Use only the <Lesson_Material> below.
</Context>
<Instructions>
1) Start with an overview of the first major concept.
2) Follow the exact order of the knowledge base.
3) Ask one focused Socratic question after each explanation or user reply.
4) Use examples/exercises present in the knowledge.
5) When a link appears like [Desc](https://...), show both description and full clickable URL.
6) When all topics are covered, ask for reflection and confidence, then end with <END_OF_CONVERSATION>.
</Instructions>
<Boundaries>
Do not say "the document says" etc. Treat the knowledge as your own.
</Boundaries>
<Formatting>
Use bullets and bolding for key points.
</Formatting>
<Lesson_Material>
---
${plainTextContext}
---
</Lesson_Material>
    `.trim();

    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
        {
          role: "model",
          parts: [
            {
              text:
                "Understood. As Rad Mentor, I will guide the user through the provided lesson material sequentially, using the Socratic method. Let's begin.",
            },
          ],
        },
        ...googleAIHistory,
      ],
    });

    const result = await chat.sendMessage(lastUserMessage.parts[0].text);
    const response = await result.response;
    let text = response.text();

    let isComplete = false;
    if (text.includes("<END_OF_CONVERSATION>")) {
      isComplete = true;
      text = text.replace("<END_OF_CONVERSATION>", "").trim();
    }

    res.json({ reply: text, isComplete });
  } catch (error) {
    console.error("Error in /chat endpoint:", error);
    res.status(500).json({ error: "Something went wrong on the server." });
  }
});

export default router;
