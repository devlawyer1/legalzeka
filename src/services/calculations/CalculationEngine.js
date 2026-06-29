const { pool } = require('../../config/db');
const { RuleVersionService } = require('./RuleVersionService');
const { HolidayCalendarService } = require('./HolidayCalendarService');
const { RuleExecutor } = require('./RuleExecutor');
const { DeadlineCalculator } = require('./DeadlineCalculator');
const { InterestCalculator } = require('./InterestCalculator');
const { EmploymentCalculator } = require('./EmploymentCalculator');
const { FeeCalculator } = require('./FeeCalculator');
const { CalculationRunService } = require('./CalculationRunService');

const EMPLOYMENT = new Set(['SEVERANCE', 'NOTICE_PAY', 'OVERTIME', 'ANNUAL_LEAVE']);
const FEES = new Set(['COURT_FEE', 'ATTORNEY_FEE', 'ENFORCEMENT_COST']);

class CalculationEngine {
  constructor({ db = pool } = {}) {
    this.db = db;
    this.ruleService = new RuleVersionService({ db });
    this.holidayService = new HolidayCalendarService({ db });
    this.executor = new RuleExecutor({ holidayService: this.holidayService });
    this.runService = new CalculationRunService({ db });
    this.deadline = new DeadlineCalculator({ ruleService: this.ruleService, executor: this.executor, holidayService: this.holidayService });
    this.interest = new InterestCalculator({ ruleService: this.ruleService });
    this.employment = new EmploymentCalculator({ ruleService: this.ruleService, executor: this.executor });
    this.fee = new FeeCalculator({ ruleService: this.ruleService, executor: this.executor });
  }

  async calculate(kind, input, accessContext, { idempotencyKey = null, parentRunId = null } = {}) {
    await this.runService.resolveScope(input, accessContext, 'write');
    const effectiveAt = input.effectiveAt || new Date().toISOString().slice(0, 10);
    let calculationType; let output;
    if (kind === 'deadline') { calculationType = 'DEADLINE'; output = await this.deadline.calculate(input, { calculationType, effectiveAt }); }
    else if (kind === 'limitation') { calculationType = input.limitationType === 'FORFEITURE' ? 'FORFEITURE' : 'LIMITATION'; output = await this.deadline.calculate(input, { calculationType, effectiveAt }); }
    else if (kind === 'interest') { calculationType = 'INTEREST'; output = await this.interest.calculate(input, { effectiveAt }); }
    else if (kind === 'employment') { calculationType = input.calculationType; if (!EMPLOYMENT.has(calculationType)) throw Object.assign(new Error('Invalid employment calculation type.'), { status: 400, code: 'INVALID_CALCULATION_TYPE' }); output = await this.employment.calculate(input, { effectiveAt }); }
    else if (kind === 'fee') { calculationType = input.calculationType || 'COURT_FEE'; if (!FEES.has(calculationType)) throw Object.assign(new Error('Invalid fee calculation type.'), { status: 400, code: 'INVALID_CALCULATION_TYPE' }); output = await this.fee.calculate(input, { effectiveAt }); }
    else throw Object.assign(new Error('Unsupported calculation type.'), { status: 400, code: 'INVALID_CALCULATION_TYPE' });
    return this.runService.create({ input, calculationType, output, effectiveAt, idempotencyKey, accessContext, parentRunId });
  }

  async recalculate(id, accessContext, idempotencyKey = null) {
    const old = await this.runService.get(id, accessContext);
    const kind = old.calculation_type === 'DEADLINE' ? 'deadline' : ['LIMITATION', 'FORFEITURE'].includes(old.calculation_type) ? 'limitation' : old.calculation_type === 'INTEREST' ? 'interest' : EMPLOYMENT.has(old.calculation_type) ? 'employment' : 'fee';
    return this.calculate(kind, old.input_data, accessContext, { idempotencyKey, parentRunId: old.id });
  }
}

let singleton;
function getCalculationEngine() { if (!singleton) singleton = new CalculationEngine(); return singleton; }

module.exports = { CalculationEngine, getCalculationEngine };
