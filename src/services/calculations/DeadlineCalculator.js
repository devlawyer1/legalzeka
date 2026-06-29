const { validateInputAgainstSchema } = require('./RuleValidator');

const warning = (warningCode, severity, message, fieldName = null) => ({ warningCode, severity, message, fieldName, metadata: {} });

class DeadlineCalculator {
  constructor({ ruleService, executor, holidayService }) {
    this.ruleService = ruleService; this.executor = executor; this.holidayService = holidayService;
  }

  async calculate(input, { calculationType = 'DEADLINE', effectiveAt }) {
    this.holidayService.assertTimezone(input.timezone);
    const triggerDate = input.triggerDate || input.customStartDate || input.notificationDate || input.decisionDate || input.eventDate;
    if (!triggerDate) return { status: 'NEEDS_INPUT', result: {}, steps: [], warnings: [warning('TRIGGER_DATE_REQUIRED', 'BLOCKING', 'Hesaplama başlangıç tarihi gerekli.', 'triggerDate')] };
    if ((input.interruptionEvents || []).length || (input.suspensionEvents || []).length) {
      return { status: 'NEEDS_REVIEW', result: { triggerDate }, steps: [], warnings: [warning('INTERRUPTION_REVIEW_REQUIRED', 'BLOCKING', 'Kesilme veya durma olayları hukuk uzmanı incelemesi gerektiriyor.')] };
    }
    const rule = await this.ruleService.resolveActive({ ruleCode: input.ruleCode, calculationType, effectiveAt });
    if (!rule) return { status: 'NEEDS_REVIEW', result: { triggerDate }, steps: [], warnings: [warning('ACTIVE_RULE_NOT_FOUND', 'BLOCKING', 'Etkin tarih için doğrulanmış aktif kural bulunamadı.', 'ruleCode')] };
    const validation = validateInputAgainstSchema({ ...input, triggerDate }, rule.input_schema);
    if (validation.missing.length) return { status: 'NEEDS_INPUT', result: {}, steps: [], warnings: validation.missing.map((field) => warning('REQUIRED_INPUT_MISSING', 'BLOCKING', `${field} alanı gerekli.`, field)), rule };
    if (validation.issues.length) return { status: 'NEEDS_REVIEW', result: {}, steps: [], warnings: validation.issues.map((message) => warning('INVALID_RULE_INPUT', 'BLOCKING', message)), rule };
    const calendarCode = input.calendarCode || rule.rule_definition.calendarCode || null;
    const needsCalendar = rule.rule_definition.steps.some((step) => ['NEXT_BUSINESS_DAY', 'PREVIOUS_BUSINESS_DAY', 'APPLY_HOLIDAY_CALENDAR'].includes(step.operation) || step.dayType === 'BUSINESS');
    const calendar = calendarCode ? await this.holidayService.load(calendarCode) : null;
    if (needsCalendar && !calendar) return { status: 'NEEDS_REVIEW', result: { triggerDate }, steps: [], warnings: [warning('ACTIVE_CALENDAR_NOT_FOUND', 'BLOCKING', 'Doğrulanmış aktif tatil takvimi bulunamadı.', 'calendarCode')], rule };
    const executed = await this.executor.executeDateRule({ input: { ...input, triggerDate }, ruleVersion: rule, calendar });
    return { status: 'CALCULATED', ...executed, warnings: [], rule, snapshot: { holidayCalendar: this.holidayService.snapshot(calendar) } };
  }
}

module.exports = { DeadlineCalculator };
