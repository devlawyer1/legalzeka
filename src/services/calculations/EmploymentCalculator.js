const { validateInputAgainstSchema } = require('./RuleValidator');

class EmploymentCalculator {
  constructor({ ruleService, executor }) { this.ruleService = ruleService; this.executor = executor; }
  async calculate(input, { effectiveAt }) {
    const type = input.calculationType;
    const missing = ['grossWage', 'employmentStartDate', 'employmentEndDate'].filter((field) => input[field] === undefined || input[field] === null || input[field] === '');
    if (missing.length) return { status: 'NEEDS_INPUT', result: {}, steps: [], warnings: missing.map((field) => ({ warningCode: 'REQUIRED_INPUT_MISSING', severity: 'BLOCKING', message: `${field} alanı gerekli.`, fieldName: field, metadata: {} })) };
    const rule = await this.ruleService.resolveActive({ ruleCode: input.ruleCode, calculationType: type, effectiveAt });
    if (!rule) return { status: 'NEEDS_REVIEW', result: {}, steps: [], warnings: [{ warningCode: 'ACTIVE_RULE_NOT_FOUND', severity: 'BLOCKING', message: 'Doğrulanmış aktif işçilik kuralı bulunamadı.', fieldName: 'ruleCode', metadata: {} }] };
    const validation = validateInputAgainstSchema(input, rule.input_schema);
    if (validation.missing.length || validation.issues.length) return { status: validation.missing.length ? 'NEEDS_INPUT' : 'NEEDS_REVIEW', result: {}, steps: [], warnings: [...validation.missing.map((field) => ({ warningCode: 'REQUIRED_INPUT_MISSING', severity: 'BLOCKING', message: `${field} alanı gerekli.`, fieldName: field, metadata: {} })), ...validation.issues.map((message) => ({ warningCode: 'INVALID_RULE_INPUT', severity: 'BLOCKING', message, metadata: {} }))], rule };
    const executed = this.executor.executeNumericSteps(String(input.grossWage), rule.rule_definition);
    return { status: 'CALCULATED', result: { calculationType: type, grossWage: String(input.grossWage), employmentStartDate: input.employmentStartDate, employmentEndDate: input.employmentEndDate, amount: executed.value.toFixed(2), parameters: rule.rule_definition.parameters || {} }, steps: executed.steps, warnings: [], rule, snapshot: {} };
  }
}

module.exports = { EmploymentCalculator };
