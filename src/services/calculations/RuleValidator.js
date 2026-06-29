const crypto = require('node:crypto');

const ALLOWED_OPERATIONS = Object.freeze([
  'ADD_DAYS', 'ADD_WEEKS', 'ADD_MONTHS', 'ADD_YEARS', 'NEXT_BUSINESS_DAY', 'PREVIOUS_BUSINESS_DAY',
  'EXCLUDE_START_DAY', 'INCLUDE_START_DAY', 'APPLY_HOLIDAY_CALENDAR', 'APPLY_RATE_PERIOD',
  'MULTIPLY', 'DIVIDE', 'SUM', 'ROUND', 'MIN', 'MAX', 'CONDITIONAL',
]);
const FORBIDDEN = /\b(eval|function|constructor|prototype|require|import|process|global|child_process|exec|spawn|shell|sql)\b|=>|`/i;
const MAX_STEPS = Number(process.env.CALCULATION_MAX_RULE_STEPS || 100);

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function checksum(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function ruleError(message, code = 'INVALID_RULE_DEFINITION') {
  const error = new Error(message);
  error.status = 400;
  error.code = code;
  return error;
}

function validateSchema(schema, label) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw ruleError(`${label} must be an object.`);
  const text = JSON.stringify(schema);
  if (text.length > 50000 || FORBIDDEN.test(text)) throw ruleError(`${label} contains unsafe content.`);
  if (schema.required && (!Array.isArray(schema.required) || schema.required.length > 100)) throw ruleError(`${label}.required is invalid.`);
  return schema;
}

function validateRuleDefinition(definition) {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) throw ruleError('Rule definition must be an object.');
  const text = JSON.stringify(definition);
  if (text.length > 100000 || FORBIDDEN.test(text)) throw ruleError('Rule definition contains arbitrary code or unsafe expressions.', 'UNSAFE_RULE_DEFINITION');
  const steps = definition.steps;
  if (!Array.isArray(steps) || steps.length === 0) throw ruleError('Rule definition requires steps.');
  if (steps.length > MAX_STEPS) throw ruleError('Rule exceeds the maximum step count.', 'RULE_STEP_LIMIT');
  const codes = new Set();
  for (const [index, step] of steps.entries()) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) throw ruleError(`Step ${index + 1} is invalid.`);
    if (!ALLOWED_OPERATIONS.includes(step.operation)) throw ruleError(`Operation ${step.operation || '(missing)'} is not allowed.`);
    const code = String(step.code || `STEP_${index + 1}`);
    if (codes.has(code)) throw ruleError(`Duplicate step code: ${code}`);
    codes.add(code);
    if (step.steps || step.next || step.goto || step.loop || step.expression) throw ruleError('Recursive or dynamic rule flow is not allowed.', 'RECURSIVE_RULE');
    if (step.operation === 'ROUND' && (!Number.isInteger(Number(step.scale ?? 2)) || Number(step.scale ?? 2) < 0 || Number(step.scale ?? 2) > 12)) {
      throw ruleError('ROUND scale must be between 0 and 12.');
    }
    if (step.roundingMode && !['ROUND_UP', 'ROUND_DOWN', 'ROUND_CEIL', 'ROUND_FLOOR', 'ROUND_HALF_UP', 'ROUND_HALF_DOWN', 'ROUND_HALF_EVEN', 'ROUND_HALF_CEIL', 'ROUND_HALF_FLOOR'].includes(step.roundingMode)) {
      throw ruleError('Unsupported rounding mode.');
    }
  }
  return definition;
}

function validateInputAgainstSchema(input, schema = {}) {
  const required = schema.required || [];
  const missing = required.filter((field) => input[field] === undefined || input[field] === null || input[field] === '');
  const issues = [];
  for (const [field, rule] of Object.entries(schema.properties || {})) {
    const value = input[field];
    if (value === undefined || value === null || value === '') continue;
    if (rule.type === 'string' && typeof value !== 'string') issues.push(`${field} must be a string`);
    if (rule.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) issues.push(`${field} must be a number`);
    if (rule.type === 'boolean' && typeof value !== 'boolean') issues.push(`${field} must be a boolean`);
    if (rule.enum && !rule.enum.includes(value)) issues.push(`${field} is not allowed`);
    if (rule.format === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) issues.push(`${field} must be YYYY-MM-DD`);
  }
  return { missing, issues };
}

module.exports = {
  ALLOWED_OPERATIONS, MAX_STEPS, canonicalize, checksum, ruleError,
  validateInputAgainstSchema, validateRuleDefinition, validateSchema,
};
