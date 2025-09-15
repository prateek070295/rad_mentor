import { GoogleGenerativeAI } from "@google/generative-ai";
import { defineSecret } from "firebase-functions/params";

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

export const convertDeltaToText = (delta) => {
  if (!delta || !delta.ops) return "";
  let text = "";
  delta.ops.forEach((op) => {
    if (typeof op.insert === "string") {
      if (op.attributes && op.attributes.link) {
        text += `[${op.insert}](${op.attributes.link})`;
      } else {
        text += op.insert;
      }
    }
  });
  return text.replace(/\n\s*\n/g, "\n");
};

export function getGenAI() {
  const key = GEMINI_API_KEY.value();
  if (!key) return null;
  return new GoogleGenerativeAI(key);
}
