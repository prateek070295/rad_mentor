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

export async function runWithRetry(task, options = {}) {
  const {
    retries = 3,
    initialDelayMs = 500,
    maxDelayMs = 8000,
    multiplier = 2,
  } = options;

  let attempt = 0;
  let delay = initialDelayMs;
  let lastError;

  while (attempt <= retries) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      const status = error?.status ?? error?.statusCode;
      const retryable = status === 429 || status === 503;

      if (!retryable || attempt === retries) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * multiplier, maxDelayMs);
      attempt += 1;
    }
  }

  throw lastError;
}
