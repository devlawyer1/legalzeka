const { z } = require('zod');

const claimSchema = z.object({
  claimKey: z.string().trim().min(1).max(120),
  text: z.string().trim().min(1).max(3000),
  sourceIds: z.array(z.string().uuid()).min(1).max(12),
  counterSourceIds: z.array(z.string().uuid()).max(12).default([]),
}).strict();

const counterArgumentSchema = z.object({
  text: z.string().trim().min(1).max(3000),
  sourceIds: z.array(z.string().uuid()).min(1).max(12),
}).strict();

const legalAnswerSchema = z.object({
  summary: z.string().trim().min(1).max(3000),
  analysis: z.array(claimSchema).min(1).max(20),
  counterArguments: z.array(counterArgumentSchema).max(12).default([]),
  missingInformation: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  warnings: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  confidence: z.object({
    level: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    reason: z.string().trim().min(1).max(1000),
  }).strict(),
}).strict();

function assertKnownSourceIds(answer, allowedSourceIds) {
  const allowed = new Set(allowedSourceIds);
  const used = new Set();
  for (const claim of answer.analysis) {
    for (const sourceId of [...claim.sourceIds, ...claim.counterSourceIds]) used.add(sourceId);
  }
  for (const counter of answer.counterArguments) {
    for (const sourceId of counter.sourceIds) used.add(sourceId);
  }
  const unknown = [...used].filter((sourceId) => !allowed.has(sourceId));
  if (unknown.length) {
    const error = new Error('Model returned source IDs that were not provided.');
    error.code = 'UNKNOWN_SOURCE_ID';
    error.unknownSourceIds = unknown;
    throw error;
  }
  return answer;
}

function parseLegalAnswer(rawText, allowedSourceIds) {
  let payload;
  try {
    payload = JSON.parse(String(rawText || ''));
  } catch (_) {
    const error = new Error('Model output is not strict JSON.');
    error.code = 'INVALID_RESEARCH_JSON';
    throw error;
  }
  const parsed = legalAnswerSchema.safeParse(payload);
  if (!parsed.success) {
    const error = new Error('Model output does not match the legal research schema.');
    error.code = 'INVALID_RESEARCH_SCHEMA';
    error.validationIssues = parsed.error.issues;
    throw error;
  }
  return assertKnownSourceIds(parsed.data, allowedSourceIds);
}

module.exports = {
  assertKnownSourceIds,
  claimSchema,
  legalAnswerSchema,
  parseLegalAnswer,
};
