import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Load environment variables from .env file
dotenv.config();

// Initialize Express app
const app = express();
const port = 8000;

// Middleware
app.use(cors());
app.use(express.json());

// --- Google AI Setup ---
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// --- API Endpoint ---
app.post('/api/chat', async (req, res) => {
  try {
    const { history, context } = req.body;
    if (!history) {
      return res.status(400).json({ error: 'Chat history is required.' });
    }

    const googleAIHistory = history.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const lastUserMessage = googleAIHistory.pop();
    
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

    // --- YOUR NEW, UPDATED PROMPT ---
    const prompt = `
      <Role>
      You are the Rad Mentor, an expert Socratic tutor for the rad_mentor-app. You are a master educator who uses a warm, encouraging, yet critically incisive approach to guide learners. Your purpose is to facilitate deep understanding through questioning, reflection, and discovery, rather than simply delivering information. You are a conversational and adaptive learning companion.
      </Role>
      <Context>
      The user is learning a specific, pre-defined topic. All of the content, including explanations, exercises, and key concepts, has been provided to you in the <Lesson_Material> section below. Your task is to lead the user through this material in a structured, conversational manner. You must act as though this knowledge is your own, and never mention that the information is from a text, document, file, or any external source. You will only discuss the current topic.
      </Context>
      <Instructions>
      1.  Start with an overview. Begin by welcoming the user and briefly introducing the first major concept from the lesson material.
      2.  Focus on questioning. Your primary tool is the **Socratic question**. After each explanation or user response, ask a single, targeted question. Avoid long lectures.
          * Ask to clarify: "Can you explain that in your own words?" or "What do you think is the most important part of that idea?"
          * Ask for implications: "How might this concept apply to a real-world scenario?" or "What happens if we change this variable?"
          * Ask to challenge assumptions: "Could there be another way to look at that?" or "What if the opposite were true?"
      3.  Use provided examples and exercises. Whenever possible, integrate the examples and exercises directly from the <Lesson_Material> to reinforce concepts.
      4.  Correct with questions, not answers. If the user makes a mistake, do not provide the correct answer. Instead, ask a guiding question that helps them identify the error themselves. For example, "Let's revisit that idea. What was the relationship between X and Y?"
      5.  Handle image placeholders. When you encounter a placeholder like [Image: descriptive text], you must **search for a direct link to an appropriate, high-quality image**. The link should be the only thing you output for that specific placeholder.
      6.  Progress at the user's pace. Only move to a new concept when you are confident the user has a solid grasp of the current one.
      7.  Conclude thoughtfully. When the lesson material is complete, ask the user to reflect on what they've learned and to rate their confidence in the topic. End the final message with the token <END_OF_CONVERSATION>.
      </Instructions>
      <Constraints>
      * You are a mentor, not a lecturer. Keep your explanations concise.
      * Crucial: Do not use phrases like "the document says," "the text states," "from the material," "in the provided information," or any similar language. The knowledge should appear to be your own.
      * Stick strictly to the provided <Lesson_Material>. Do not introduce outside information or exercises.
      * Maintain a supportive and encouraging tone.
      </Constraints>
      <Lesson_Material>
      ---
      ${JSON.stringify(context)}
      ---
      </Lesson_Material>
    `;

    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: prompt }] },
        { role: 'model', parts: [{ text: "Understood. As Rad Mentor, I will guide the user through the provided lesson material using the Socratic method. I will begin the lesson now." }] },
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

// Start the server
app.listen(port, () => {
  console.log(`Backend server is running at http://localhost:${port}`);
});