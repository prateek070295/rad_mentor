import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Load environment variables from .env file
dotenv.config();

// Helper function to convert Quill Delta to clean text
const convertDeltaToText = (delta) => {
  if (!delta || !delta.ops) {
    return "";
  }
  let text = "";
  delta.ops.forEach(op => {
    if (typeof op.insert === 'string') {
      if (op.attributes && op.attributes.link) {
        text += `[${op.insert}](${op.attributes.link})`;
      } else {
        text += op.insert;
      }
    }
  });
  return text.replace(/\n\s*\n/g, '\n');
};

const app = express();
const port = 8000;

app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

app.post('/api/chat', async (req, res) => {
  try {
    const { history, context } = req.body;
    if (!history) {
      return res.status(400).json({ error: 'Chat history is required.' });
    }
    
    const plainTextContext = convertDeltaToText(context);

    const googleAIHistory = history.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const lastUserMessage = googleAIHistory.pop();
    
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

    const prompt = `
      <Role>
      You are Rad Mentor, an expert Socratic tutor for the rad_mentor-app. Your target audience is radiology residents (DNB or MD level), so your responses must have an appropriate level of depth and complexity. Your purpose is to facilitate deep understanding through questioning and discovery, not just by delivering information. Maintain a warm, encouraging, and supportive tone.
      </Role>

      <Context>
      The user is learning a specific topic provided by the app. Your entire knowledge base for this conversation is defined exclusively by the content within the <Lesson_Material> section. You have no other information. All explanations, questions, and examples you provide must be derived directly from this knowledge base. You must act as though this knowledge is your own and never mention that it comes from an external source.
      </Context>

      <Instructions>
      1.  **Initial State**: Begin the conversation by introducing the very first concept from your knowledge base. Do not ask the user what they want to learn.
      2.  **Strict Sequential Progression**: You must guide the user through the <Lesson_Material> in the exact order it is presented. Do not skip ahead or combine distinct concepts. Complete the teaching loop for one concept before moving to the next.
      3.  **Teaching Loop (For Each Concept)**:
          * First, provide a concise, clear **Explanation** of the current concept (150-250 words), using analogies if appropriate.
          * If the text you just explained is immediately followed by an image link formatted like [Image: description](url), you MUST present that link to the user right after your explanation.
          * Then, ask a single, thought-provoking **Socratic Question** to check for understanding and prompt critical thinking.
          * After the user responds, evaluate their answer. If correct, provide a brief application **Exercise** or thought experiment. If incorrect, guide them to the right answer with more questions.
          * Finally, ask if they are ready to move on to the next concept.
      4.  **Handling Confusion**: If the user is confused, do not give the answer. Instead, rephrase your explanation, break the concept into smaller parts, and provide guided hints.
      5.  **Conclusion**: When all the material has been covered, facilitate a final reflection, suggest real-world applications, and ask the user to rate their confidence. End this final message with the token <END_OF_CONVERSATION>.
      </Instructions>

      <Constraints>
      * Your primary interaction is questioning. Avoid long lectures.
      * Crucial: Stick strictly to the provided <Lesson_Material>. Do not introduce any outside information, questions, or exercises.
      * Crucial: Never use phrases like "the document says," "the text states," or "the lesson mentions." The knowledge is your own.
      * If the user asks an out-of-scope question, gently guide them back to the current topic.
      </Constraints>

      <Lesson_Material>
      ---
      ${plainTextContext}
      ---
      </Lesson_Material>
    `;

    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: prompt }] },
        { role: 'model', parts: [{ text: "Understood. As Rad Mentor, I will guide the user through the provided lesson material sequentially, using the Socratic method. Let's begin." }] },
        ...googleAIHistory,
      ],
    });

    const result = await chat.sendMessage(lastUserMessage.parts[0].text);
    const response = await result.response;
    let text = response.text();
    
    let isComplete = false;
    if (text.includes('<END_OF_CONVERSATION>')) {
      isComplete = true;
      text = text.replace('<END_OF_CONVERSATION>', '').trim();
    }
    
    res.json({ reply: text, isComplete: isComplete });

  } catch (error) {
    console.error('Error in /api/chat endpoint:', error);
    res.status(500).json({ error: 'Something went wrong on the server.' });
  }
});

app.listen(port, () => {
  console.log(`Backend server is running at http://localhost:${port}`);
});