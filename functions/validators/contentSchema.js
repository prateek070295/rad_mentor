// file: functions/validators/contentSchema.js

import Ajv from "ajv";
const ajv = new Ajv();

const checkpointSchema = {
  type: "object",
  properties: {
    type: { enum: ["mcq", "short"] },
    question_md: { type: "string", maxLength: 500 },
    options: {
      type: "array",
      items: { type: "string", maxLength: 200 },
      maxItems: 5,
    },
    correct_index: { type: "integer", minimum: 0, maximum: 4 },
    answer_patterns: {
      type: "array",
      items: { type: "string", maxLength: 200 },
      maxItems: 10,
    },
    rationale_md: { type: "string", maxLength: 1000 },
    hints: {
      type: "array",
      items: { type: "string", maxLength: 200 },
      maxItems: 3,
    },
    bloom_level: {
      enum: ["remember", "understand", "apply", "analyze", "evaluate"],
    },
    figure_id: { type: ["string", "null"], maxLength: 50 },
  },
  required: ["type", "question_md", "rationale_md", "hints", "bloom_level"],
};

const contentSectionSchema = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 3, maxLength: 100 },
    order: { type: "integer", minimum: 1 },
    body_md: { type: "string", minLength: 50, maxLength: 1200 },
    objectives: {
      type: "array",
      items: { type: "string", maxLength: 200 },
      maxItems: 5,
    },
    key_points: {
      type: "array",
      items: { type: "string", maxLength: 200 },
      maxItems: 5,
    },
    misconceptions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          claim: { type: "string", maxLength: 200 },
          correction: { type: "string", maxLength: 300 },
        },
        required: ["claim", "correction"],
      },
      maxItems: 3,
    },
    images: {
      type: "array",
      items: {
        type: "object",
        properties: {
          url: { type: "string" },
          alt: { type: "string", maxLength: 150 },
          source: { type: "string", maxLength: 100 },
          figure_id: { type: "string", maxLength: 50 },
        },
        required: ["alt"],
      },
      maxItems: 5,
    },
    checkpoints: {
      type: "array",
      items: checkpointSchema,
      minItems: 1,
    },
  },
  required: ["title", "order", "body_md", "checkpoints"],
};

const topicStructureSchema = {
  type: "object",
  properties: {
    sections: {
      type: "array",
      items: contentSectionSchema,
      minItems: 1,
    },
  },
  required: ["sections"],
};

export const validateStructure = ajv.compile(topicStructureSchema);