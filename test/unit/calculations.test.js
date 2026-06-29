const test = require('node:test');
const assert = require('node:assert/strict');

const { addDays, addMonths, addYears, formatDate, parseDate } = require('../../src/services/calculations/dateUtils');
const { HolidayCalendarService } = require('../../src/services/calculations/HolidayCalendarService');
const { RuleExecutor } = require('../../src/services/calculations/RuleExecutor');
const { InterestCalculator } = require('../../src/services/calculations/InterestCalculator');
const { DeadlineCalculator } = require('../../src/services/calculations/DeadlineCalculator');
const { checksum, validateRuleDefinition } = require('../../src/services/calculations/RuleValidator');
const { hash } = require('../../src/services/calculations/CalculationRunService');

const holidayService = new HolidayCalendarService({ db: { query: async () => ({ rows: [] }) } });
const executor = new RuleExecutor({ holidayService });
const calendar = { code: 'TEST', timezone: 'Europe/Istanbul', days: [{ date: '2026-01-01', isFullDay: true }] };
const dateRule = (steps) => ({ id: 'v1', legal_source_id: null, rule_definition: { steps } });

test('Phase 4 deterministic calculation primitives', async (t) => {
  await t.test('arbitrary eval code is rejected', () => assert.throws(() => validateRuleDefinition({ steps: [{ operation: 'SUM', value: 'eval(1)' }] }), /unsafe/i));
  await t.test('Function constructor code is rejected', () => assert.throws(() => validateRuleDefinition({ steps: [{ operation: 'SUM', value: 'Function' }] }), /unsafe/i));
  await t.test('unknown operation is rejected', () => assert.throws(() => validateRuleDefinition({ steps: [{ operation: 'RUN_SHELL' }] }), /not allowed/i));
  await t.test('recursive flow is rejected', () => assert.throws(() => validateRuleDefinition({ steps: [{ operation: 'SUM', value: 1, loop: true }] }), /Recursive/i));
  await t.test('duplicate step codes are rejected', () => assert.throws(() => validateRuleDefinition({ steps: [{ code: 'A', operation: 'SUM', value: 1 }, { code: 'A', operation: 'SUM', value: 1 }] }), /Duplicate/i));
  await t.test('excessive rule steps are rejected', () => assert.throws(() => validateRuleDefinition({ steps: Array.from({ length: 101 }, (_, index) => ({ code: `S${index}`, operation: 'SUM', value: 1 })) }), /maximum/i));
  await t.test('invalid rounding mode is rejected', () => assert.throws(() => validateRuleDefinition({ steps: [{ operation: 'ROUND', roundingMode: 'RANDOM' }] }), /rounding/i));
  await t.test('canonical checksum ignores object key order', () => assert.equal(checksum({ b: 2, a: 1 }), checksum({ a: 1, b: 2 })));
  await t.test('checksum detects rule modification', () => assert.notEqual(checksum({ steps: [{ operation: 'SUM', value: 1 }] }), checksum({ steps: [{ operation: 'SUM', value: 2 }] })));
  await t.test('invalid calendar date is rejected', () => assert.equal(parseDate('2026-02-30'), null));
  await t.test('leap day is parsed', () => assert.equal(formatDate(parseDate('2028-02-29')), '2028-02-29'));
  await t.test('month-end addition clamps to February', () => assert.equal(formatDate(addMonths(parseDate('2026-01-31'), 1)), '2026-02-28'));
  await t.test('leap-year addition clamps February 29', () => assert.equal(formatDate(addYears(parseDate('2028-02-29'), 1)), '2029-02-28'));
  await t.test('year-end day addition rolls into next year', () => assert.equal(formatDate(addDays(parseDate('2026-12-31'), 1)), '2027-01-01'));
  await t.test('weekend is not a business day', () => assert.equal(holidayService.isBusinessDay(parseDate('2026-06-28'), calendar), false));
  await t.test('explicit holiday is not a business day', () => assert.equal(holidayService.isBusinessDay(parseDate('2026-01-01'), calendar), false));
  await t.test('partial holiday remains a business day', () => assert.equal(holidayService.isBusinessDay(parseDate('2026-01-02'), { days: [{ date: '2026-01-02', isFullDay: false }] }), true));
  await t.test('invalid timezone is rejected', () => assert.throws(() => holidayService.assertTimezone('UTC'), (error) => error.code === 'INVALID_TIMEZONE'));

  await t.test('excluded start day applies calendar-day duration', async () => {
    const output = await executor.executeDateRule({ input: { triggerDate: '2026-06-01' }, ruleVersion: dateRule([{ operation: 'EXCLUDE_START_DAY' }, { operation: 'ADD_DAYS', value: 10 }]), calendar });
    assert.equal(output.result.finalDate, '2026-06-11'); assert.equal(output.result.firstDay, '2026-06-02');
  });
  await t.test('included start day applies calendar-day duration', async () => {
    const output = await executor.executeDateRule({ input: { triggerDate: '2026-06-01' }, ruleVersion: dateRule([{ operation: 'INCLUDE_START_DAY' }, { operation: 'ADD_DAYS', value: 10 }]), calendar });
    assert.equal(output.result.finalDate, '2026-06-10'); assert.equal(output.result.firstDay, '2026-06-01');
  });
  await t.test('business-day addition skips weekend', async () => {
    const output = await executor.executeDateRule({ input: { triggerDate: '2026-06-26' }, ruleVersion: dateRule([{ operation: 'EXCLUDE_START_DAY' }, { operation: 'ADD_DAYS', value: 1, dayType: 'BUSINESS' }]), calendar });
    assert.equal(output.result.finalDate, '2026-06-29');
  });
  await t.test('holiday adjustment advances a holiday', async () => {
    const output = await executor.executeDateRule({ input: { triggerDate: '2025-12-31' }, ruleVersion: dateRule([{ operation: 'ADD_DAYS', value: 1 }, { operation: 'APPLY_HOLIDAY_CALENDAR' }]), calendar });
    assert.equal(output.result.finalDate, '2026-01-02');
  });
  await t.test('next business day always advances from a business day', async () => {
    const output = await executor.executeDateRule({ input: { triggerDate: '2026-06-26' }, ruleVersion: dateRule([{ operation: 'NEXT_BUSINESS_DAY' }]), calendar });
    assert.equal(output.result.finalDate, '2026-06-29');
  });
  await t.test('weeks can be added deterministically', async () => {
    const output = await executor.executeDateRule({ input: { triggerDate: '2026-06-01' }, ruleVersion: dateRule([{ operation: 'ADD_WEEKS', value: 2 }]), calendar });
    assert.equal(output.result.finalDate, '2026-06-15');
  });
  await t.test('numeric execution avoids floating-point drift', () => {
    const output = executor.executeNumericSteps('0.1', { steps: [{ operation: 'SUM', value: '0.2' }] });
    assert.equal(output.value.toString(), '0.3');
  });
  await t.test('numeric rounding is deterministic', () => {
    const output = executor.executeNumericSteps('1.005', { steps: [{ operation: 'ROUND', scale: 2, roundingMode: 'ROUND_HALF_UP' }] });
    assert.equal(output.value.toString(), '1.01');
  });
  await t.test('division and bounds use Decimal operations', () => {
    const output = executor.executeNumericSteps('100', { steps: [{ operation: 'DIVIDE', value: 3 }, { operation: 'MIN', value: 40 }, { operation: 'MAX', value: 30 }] });
    assert.equal(output.value.toDecimalPlaces(2).toString(), '33.33');
  });

  await t.test('deadline without trigger returns NEEDS_INPUT', async () => {
    const calculator = new DeadlineCalculator({ ruleService: {}, executor, holidayService });
    const output = await calculator.calculate({}, { effectiveAt: '2026-01-01' });
    assert.equal(output.status, 'NEEDS_INPUT');
  });
  await t.test('limitation interruption returns NEEDS_REVIEW', async () => {
    const calculator = new DeadlineCalculator({ ruleService: {}, executor, holidayService });
    const output = await calculator.calculate({ triggerDate: '2026-01-01', interruptionEvents: [{}] }, { calculationType: 'LIMITATION', effectiveAt: '2026-01-01' });
    assert.equal(output.status, 'NEEDS_REVIEW');
  });
  await t.test('DRAFT or missing active deadline rule cannot calculate', async () => {
    const calculator = new DeadlineCalculator({ ruleService: { resolveActive: async () => null }, executor, holidayService });
    const output = await calculator.calculate({ triggerDate: '2026-01-01' }, { effectiveAt: '2026-01-01' });
    assert.equal(output.status, 'NEEDS_REVIEW');
  });

  await t.test('interest rejects negative principal', async () => {
    const output = await new InterestCalculator({ ruleService: {} }).calculate({ principal: '-1', startDate: '2026-01-01', endDate: '2026-02-01' }, { effectiveAt: '2026-01-01' });
    assert.equal(output.status, 'NEEDS_INPUT');
  });
  await t.test('interest rejects reversed dates', async () => {
    const output = await new InterestCalculator({ ruleService: {} }).calculate({ principal: '1', startDate: '2026-02-01', endDate: '2026-01-01' }, { effectiveAt: '2026-01-01' });
    assert.equal(output.status, 'NEEDS_INPUT');
  });
  await t.test('interest splits multiple verified rate periods', async () => {
    const rule = { id: 'v', rule_set_id: 'r', rule_definition: { rateCode: 'TEST', interestMode: 'SIMPLE' } };
    const service = { resolveActive: async () => rule, loadRatePeriods: async () => [
      { id: 'p1', effective_from: '2026-01-01', effective_to: '2026-01-15', numeric_value: '10', unit: 'PERCENT_YEARLY', source_reference: 'source 1' },
      { id: 'p2', effective_from: '2026-01-16', effective_to: null, numeric_value: '20', unit: 'PERCENT_YEARLY', source_reference: 'source 2' },
    ] };
    const output = await new InterestCalculator({ ruleService: service }).calculate({ principal: '1000', startDate: '2026-01-01', endDate: '2026-02-01', roundingMode: 'ROUND_HALF_UP' }, { effectiveAt: '2026-01-01' });
    assert.equal(output.status, 'CALCULATED'); assert.equal(output.result.periods.length, 2); assert.equal(output.result.totalInterest, '12.88');
  });
  await t.test('rate gap prevents a final interest result', async () => {
    const rule = { id: 'v', rule_set_id: 'r', rule_definition: { rateCode: 'TEST', interestMode: 'SIMPLE' } };
    const service = { resolveActive: async () => rule, loadRatePeriods: async () => [{ id: 'p', effective_from: '2026-01-05', effective_to: null, numeric_value: '10', unit: 'PERCENT_YEARLY', source_reference: 'source' }] };
    const output = await new InterestCalculator({ ruleService: service }).calculate({ principal: '100', startDate: '2026-01-01', endDate: '2026-02-01' }, { effectiveAt: '2026-01-01' });
    assert.equal(output.status, 'NEEDS_REVIEW');
  });
  await t.test('snapshot result hash is reproducible', () => {
    const value = { input: { b: 2, a: 1 }, result: { amount: '10.00' } };
    assert.equal(hash(value), hash({ result: { amount: '10.00' }, input: { a: 1, b: 2 } }));
  });
});
