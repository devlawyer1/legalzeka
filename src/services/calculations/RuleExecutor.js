const Decimal = require('decimal.js');
const { validateRuleDefinition } = require('./RuleValidator');
const { addDays, addMonths, addYears, formatDate, parseDate } = require('./dateUtils');

class RuleExecutor {
  constructor({ holidayService }) { this.holidayService = holidayService; }

  async executeDateRule({ input, ruleVersion, calendar }) {
    const definition = validateRuleDefinition(ruleVersion.rule_definition);
    let current = parseDate(input.triggerDate || input.startDate || input.customStartDate);
    if (!current) throw Object.assign(new Error('Valid trigger date is required.'), { code: 'TRIGGER_DATE_REQUIRED' });
    let includeStart = false;
    const steps = [];
    let durationApplied = null;
    for (const [index, step] of definition.steps.entries()) {
      const before = formatDate(current);
      if (step.operation === 'EXCLUDE_START_DAY') includeStart = false;
      else if (step.operation === 'INCLUDE_START_DAY') includeStart = true;
      else if (step.operation === 'ADD_DAYS') {
        const amount = Number(step.value);
        if (!Number.isInteger(amount) || amount < 0 || amount > 100000) throw new Error('Invalid ADD_DAYS amount.');
        if (step.dayType === 'BUSINESS') {
          let remaining = amount;
          if (includeStart && this.holidayService.isBusinessDay(current, calendar)) remaining -= 1;
          while (remaining > 0) {
            current = addDays(current, 1);
            if (this.holidayService.isBusinessDay(current, calendar)) remaining -= 1;
          }
        } else current = addDays(current, Math.max(0, amount - (includeStart ? 1 : 0)));
        durationApplied = { amount, unit: step.dayType === 'BUSINESS' ? 'BUSINESS_DAY' : 'CALENDAR_DAY' };
      } else if (step.operation === 'ADD_MONTHS') {
        const amount = Number(step.value);
        if (!Number.isInteger(amount) || amount < 0 || amount > 12000) throw new Error('Invalid ADD_MONTHS amount.');
        current = addMonths(current, amount - (includeStart && amount === 0 ? 0 : 0));
        durationApplied = { amount, unit: 'MONTH' };
      } else if (step.operation === 'ADD_WEEKS') {
        const amount = Number(step.value);
        if (!Number.isInteger(amount) || amount < 0 || amount > 5200) throw new Error('Invalid ADD_WEEKS amount.');
        current = addDays(current, (amount * 7) - (includeStart ? 1 : 0));
        durationApplied = { amount, unit: 'WEEK' };
      } else if (step.operation === 'ADD_YEARS') {
        const amount = Number(step.value);
        if (!Number.isInteger(amount) || amount < 0 || amount > 1000) throw new Error('Invalid ADD_YEARS amount.');
        current = addYears(current, amount);
        durationApplied = { amount, unit: 'YEAR' };
      } else if (step.operation === 'NEXT_BUSINESS_DAY') current = this.holidayService.nextBusinessDay(addDays(current, 1), calendar, 1);
      else if (step.operation === 'PREVIOUS_BUSINESS_DAY') current = this.holidayService.nextBusinessDay(addDays(current, -1), calendar, -1);
      else if (step.operation === 'APPLY_HOLIDAY_CALENDAR') current = this.holidayService.nextBusinessDay(current, calendar, 1);
      else if (!['CONDITIONAL', 'MIN', 'MAX', 'ROUND'].includes(step.operation)) throw new Error(`Operation ${step.operation} is not valid in a date rule.`);
      steps.push({
        stepCode: step.code || `STEP_${index + 1}`, title: step.title || step.operation,
        operation: step.operation, inputSnapshot: { date: before, includeStart },
        result: { date: formatDate(current) }, explanation: step.explanation || `${step.operation} uygulandı.`,
        legalSourceId: ruleVersion.legal_source_id || null,
      });
    }
    return {
      result: {
        triggerDate: input.triggerDate || input.startDate || input.customStartDate,
        firstDay: formatDate(addDays(parseDate(input.triggerDate || input.startDate || input.customStartDate), includeStart ? 0 : 1)),
        includeStartDay: includeStart, duration: durationApplied, finalDate: formatDate(current),
        finalTime: definition.deadlineTime || null, timezone: input.timezone || 'Europe/Istanbul',
      },
      steps,
    };
  }

  executeNumericSteps(initial, definition) {
    validateRuleDefinition(definition);
    let value = new Decimal(initial);
    const steps = [];
    for (const [index, step] of definition.steps.entries()) {
      const before = value;
      const operand = step.value === undefined ? null : new Decimal(step.value);
      if (step.operation === 'MULTIPLY') value = value.mul(operand);
      else if (step.operation === 'DIVIDE') value = value.div(operand);
      else if (step.operation === 'SUM') value = value.add(operand);
      else if (step.operation === 'MIN') value = Decimal.min(value, operand);
      else if (step.operation === 'MAX') value = Decimal.max(value, operand);
      else if (step.operation === 'ROUND') value = value.toDecimalPlaces(Number(step.scale ?? 2), Decimal[step.roundingMode || 'ROUND_HALF_UP']);
      else continue;
      steps.push({ stepCode: step.code || `STEP_${index + 1}`, title: step.title || step.operation, operation: step.operation, inputSnapshot: { value: before.toString() }, result: { value: value.toString() }, explanation: step.explanation || `${step.operation} uygulandı.` });
    }
    return { value, steps };
  }
}

module.exports = { RuleExecutor };
