const Decimal = require('decimal.js');
const { addDays, daysBetween, formatDate, parseDate } = require('./dateUtils');

const warn = (code, message, fieldName = null) => ({ warningCode: code, severity: 'BLOCKING', message, fieldName, metadata: {} });

class InterestCalculator {
  constructor({ ruleService }) { this.ruleService = ruleService; }

  async calculate(input, { effectiveAt }) {
    let principal;
    try { principal = new Decimal(String(input.principal)); } catch { return { status: 'NEEDS_INPUT', result: {}, steps: [], warnings: [warn('INVALID_PRINCIPAL', 'Geçerli bir anapara gerekli.', 'principal')] }; }
    if (!principal.isFinite() || principal.isNegative() || principal.abs().greaterThan('1000000000000000')) return { status: 'NEEDS_INPUT', result: {}, steps: [], warnings: [warn('INVALID_PRINCIPAL', 'Anapara negatif olamaz veya güvenli sınırı aşamaz.', 'principal')] };
    const start = parseDate(input.startDate); const end = parseDate(input.endDate);
    if (!start || !end || end <= start) return { status: 'NEEDS_INPUT', result: {}, steps: [], warnings: [warn('INVALID_DATE_RANGE', 'Bitiş tarihi başlangıç tarihinden sonra olmalı.', 'endDate')] };
    const rule = await this.ruleService.resolveActive({ ruleCode: input.ruleCode, calculationType: 'INTEREST', effectiveAt });
    if (!rule) return { status: 'NEEDS_REVIEW', result: {}, steps: [], warnings: [warn('ACTIVE_RULE_NOT_FOUND', 'Doğrulanmış aktif faiz kuralı bulunamadı.', 'ruleCode')] };
    const rateCode = input.rateCode || rule.rule_definition.rateCode;
    if (!rateCode) return { status: 'NEEDS_REVIEW', result: {}, steps: [], warnings: [warn('RATE_CODE_REQUIRED', 'Faiz oran serisi kuralda tanımlı değil.', 'rateCode')], rule };
    const convention = input.dayCountConvention || rule.rule_definition.dayCountConvention || 'ACTUAL_365';
    if (!['ACTUAL_365', 'ACTUAL_360'].includes(convention)) return { status: 'NEEDS_REVIEW', result: {}, steps: [], warnings: [warn('DAY_COUNT_UNSUPPORTED', 'Gün sayım yöntemi desteklenmiyor.')], rule };
    const mode = rule.rule_definition.interestMode || 'SIMPLE';
    if (!['SIMPLE', 'COMPOUND'].includes(mode) || (mode === 'COMPOUND' && rule.rule_definition.allowCompound !== true)) return { status: 'NEEDS_REVIEW', result: {}, steps: [], warnings: [warn('INTEREST_MODE_NOT_VERIFIED', 'Faiz yöntemi aktif kural tarafından doğrulanmamış.')], rule };
    const rates = await this.ruleService.loadRatePeriods(rateCode, input.startDate, input.endDate);
    const periods = []; const steps = []; let cursor = start; let totalInterest = new Decimal(0); let balance = principal;
    for (const rate of rates) {
      const rateStart = parseDate(rate.effective_from);
      const rateEnd = rate.effective_to ? addDays(parseDate(rate.effective_to), 1) : end;
      const segmentStart = cursor > rateStart ? cursor : rateStart;
      const segmentEnd = end < rateEnd ? end : rateEnd;
      if (segmentStart > cursor || segmentEnd <= segmentStart) continue;
      const days = daysBetween(segmentStart, segmentEnd); const annualRate = new Decimal(rate.numeric_value);
      const base = mode === 'COMPOUND' ? balance : principal;
      const interest = base.mul(annualRate).div(100).mul(days).div(convention === 'ACTUAL_360' ? 360 : 365);
      totalInterest = totalInterest.add(interest); if (mode === 'COMPOUND') balance = balance.add(interest);
      const item = { ratePeriodId: rate.id, startDate: formatDate(segmentStart), endDate: formatDate(segmentEnd), days, rate: annualRate.toString(), unit: rate.unit, interest: interest.toString(), sourceReference: rate.source_reference };
      periods.push(item); steps.push({ stepCode: `RATE_PERIOD_${periods.length}`, title: `${item.startDate} - ${item.endDate}`, operation: 'APPLY_RATE_PERIOD', inputSnapshot: { principal: base.toString(), days, rate: item.rate }, result: { interest: item.interest }, explanation: `${days} gün için ${item.rate} ${rate.unit} oranı uygulandı.`, legalSourceId: rate.legal_source_id || null });
      cursor = segmentEnd; if (cursor >= end) break;
    }
    if (cursor < end) return { status: 'NEEDS_REVIEW', result: { principal: principal.toString(), periods }, steps, warnings: [warn('RATE_PERIOD_GAP', 'Tarih aralığının tamamını kapsayan doğrulanmış oran bulunamadı.')], rule, snapshot: { ratePeriods: rates } };
    const rounding = Decimal[input.roundingMode || rule.rule_definition.roundingMode || 'ROUND_HALF_UP'];
    if (rounding === undefined) return { status: 'NEEDS_INPUT', result: {}, steps, warnings: [warn('INVALID_ROUNDING_MODE', 'Geçersiz yuvarlama yöntemi.', 'roundingMode')], rule };
    const rounded = totalInterest.toDecimalPlaces(2, rounding); const amount = principal.add(rounded);
    return { status: 'CALCULATED', result: { principal: principal.toFixed(2), currency: input.currency || 'TRY', totalInterest: rounded.toFixed(2), totalAmount: amount.toFixed(2), periods, roundingDifference: rounded.minus(totalInterest).toString(), dayCountConvention: convention, interestMode: mode }, steps, warnings: [], rule, snapshot: { ratePeriods: rates, roundingMode: input.roundingMode || rule.rule_definition.roundingMode || 'ROUND_HALF_UP' } };
  }
}

module.exports = { InterestCalculator };
