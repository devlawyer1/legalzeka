const Decimal = require('decimal.js');
const { validateInputAgainstSchema } = require('./RuleValidator');

class FeeCalculator {
  constructor({ ruleService, executor }) { this.ruleService = ruleService; this.executor = executor; }
  async calculate(input, { effectiveAt }) {
    let base;
    try { base = new Decimal(String(input.baseAmount)); } catch { base = null; }
    if (!base || !base.isFinite() || base.isNegative()) return { status: 'NEEDS_INPUT', result: {}, steps: [], warnings: [{ warningCode: 'INVALID_BASE_AMOUNT', severity: 'BLOCKING', message: 'Geçerli bir hesap matrahı gerekli.', fieldName: 'baseAmount', metadata: {} }] };
    const type = input.calculationType || 'COURT_FEE';
    const rule = await this.ruleService.resolveActive({ ruleCode: input.ruleCode, calculationType: type, effectiveAt });
    if (!rule) return { status: 'NEEDS_REVIEW', result: {}, steps: [], warnings: [{ warningCode: 'ACTIVE_RULE_NOT_FOUND', severity: 'BLOCKING', message: 'Doğrulanmış aktif tarife kuralı bulunamadı.', fieldName: 'ruleCode', metadata: {} }] };
    const validation = validateInputAgainstSchema(input, rule.input_schema);
    if (validation.missing.length || validation.issues.length) return { status: validation.missing.length ? 'NEEDS_INPUT' : 'NEEDS_REVIEW', result: {}, steps: [], warnings: [...validation.missing.map((field) => ({ warningCode: 'REQUIRED_INPUT_MISSING', severity: 'BLOCKING', message: `${field} alanı gerekli.`, fieldName: field, metadata: {} })), ...validation.issues.map((message) => ({ warningCode: 'INVALID_RULE_INPUT', severity: 'BLOCKING', message, metadata: {} }))], rule };
    const executed = this.executor.executeNumericSteps(base, rule.rule_definition);
    return { status: 'CALCULATED', result: { calculationType: type, baseAmount: base.toFixed(2), amount: executed.value.toFixed(2), tariffYear: rule.rule_definition.tariffYear || String(rule.effective_from).slice(0, 4), minimum: rule.rule_definition.minimum || null, maximum: rule.rule_definition.maximum || null }, steps: executed.steps, warnings: [], rule, snapshot: {} };
  }
}

module.exports = { FeeCalculator };
