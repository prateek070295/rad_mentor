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
      items: { type: "string", maxLength: 300 },
      minItems: 4,
      maxItems: 4,
    },
    correct_index: { type: "integer", minimum: 0, maximum: 3 },
    answer_patterns: { type: "array", items: { type: "string", maxLength: 300 }, maxItems: 10 },
    rationale_md: { type: "string", maxLength: 1000 },
    hints: { type: "array", items: { type: "string", maxLength: 300 }, maxItems: 3 },
    bloom_level: { enum: ["remember", "understand", "apply", "analyze", "evaluate"] },
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
    // objectives & key_points have been moved from here
    misconceptions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          claim: { type: "string", maxLength: 600 },
          correction: { type: "string", maxLength: 600 },
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
          alt: { type: "string", maxLength: 300 },
          source: { type: "string", maxLength: 100 },
          figure_id: { type: "string", maxLength: 50 },
        },
        required: ["alt"],
      },
      maxItems: 5,
    },
    cases: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string", maxLength: 300 },
          url: { type: "string" },
        },
        required: ["label"],
      },
      maxItems: 5,
    },
    tables: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          table_id: { type: "string", minLength: 3, maxLength: 100 },
          caption: { type: "string", minLength: 3, maxLength: 400 },
          headers: {
            type: "array",
            minItems: 1,
            maxItems: 10,
            items: { type: "string", minLength: 1, maxLength: 200 },
          },
          rows: {
            type: "array",
            minItems: 1,
            maxItems: 40,
            items: {
              type: "array",
              minItems: 1,
              maxItems: 10,
              items: {
                type: "object",
                properties: {
                  content: { type: "string", maxLength: 400 },
                },
                required: ["content"],
              },
            },
          },
        },
        required: ["table_id", "caption", "headers", "rows"],
      },
    },
    checkpoints: {
      type: "array",
      items: checkpointSchema,
      minItems: 1,
    },
  },
  required: ["title", "order", "body_md", "checkpoints"], // misconceptions is correctly optional
};

const topicStructureSchema = {
  type: "object",
  properties: {
    // MOVED: 'objectives' is now at the top level
    objectives: {
      type: "array",
      items: { type: "string", maxLength: 600 },
      maxItems: 5,
    },
    sections: {
      type: "array",
      items: contentSectionSchema,
      minItems: 1,
    },
    // MOVED: 'key_points' is now at the top level
    key_points: {
      type: "array",
      items: { type: "string", maxLength: 600 },
      maxItems: 5,
    },
  },
  required: ["objectives", "sections", "key_points"], // Now required for the whole topic
};

export const validateStructure = ajv.compile(topicStructureSchema);
