function parseDate(value) {
  const input = value instanceof Date
    ? (Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10))
    : String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const date = new Date(`${input}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input ? null : date;
}

function formatDate(date) { return date.toISOString().slice(0, 10); }
function addDays(date, days) { const result = new Date(date); result.setUTCDate(result.getUTCDate() + Number(days)); return result; }
function daysBetween(start, end) { return Math.round((end.getTime() - start.getTime()) / 86400000); }
function clampMonth(year, month, day) { return new Date(Date.UTC(year, month + 1, 0)).getUTCDate() < day ? new Date(Date.UTC(year, month + 1, 0)) : new Date(Date.UTC(year, month, day)); }
function addMonths(date, months) {
  const absolute = date.getUTCMonth() + Number(months);
  const year = date.getUTCFullYear() + Math.floor(absolute / 12);
  const month = ((absolute % 12) + 12) % 12;
  return clampMonth(year, month, date.getUTCDate());
}
function addYears(date, years) {
  const year = date.getUTCFullYear() + Number(years);
  const month = date.getUTCMonth();
  return clampMonth(year, month, date.getUTCDate());
}

module.exports = { addDays, addMonths, addYears, daysBetween, formatDate, parseDate };
