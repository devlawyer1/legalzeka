const { pool } = require('../../config/db');
const { addDays, formatDate } = require('./dateUtils');

class HolidayCalendarService {
  constructor({ db = pool } = {}) { this.db = db; }

  assertTimezone(timezone) {
    if ((timezone || 'Europe/Istanbul') !== 'Europe/Istanbul') {
      const error = new Error('Only Europe/Istanbul timezone is supported for Turkish legal calendars.');
      error.status = 400;
      error.code = 'INVALID_TIMEZONE';
      throw error;
    }
  }

  async load(code, { db = this.db } = {}) {
    const { rows } = await db.query(
      `SELECT calendar.*, coalesce(jsonb_agg(jsonb_build_object(
         'date', day.holiday_date, 'name', day.name, 'type', day.holiday_type,
         'isFullDay', day.is_full_day, 'sourceReference', day.source_reference
       ) ORDER BY day.holiday_date) FILTER (WHERE day.id IS NOT NULL), '[]'::jsonb) AS days
       FROM holiday_calendars calendar
       LEFT JOIN holiday_calendar_days day ON day.calendar_id = calendar.id
       WHERE calendar.code = $1 AND calendar.status = 'ACTIVE'
       GROUP BY calendar.id`,
      [code]
    );
    return rows[0] || null;
  }

  snapshot(calendar) {
    return calendar ? {
      id: calendar.id, code: calendar.code, name: calendar.name,
      timezone: calendar.timezone, days: calendar.days,
    } : null;
  }

  isBusinessDay(date, calendar) {
    const day = date.getUTCDay();
    if (day === 0 || day === 6) return false;
    const iso = formatDate(date);
    return !(calendar?.days || []).some((holiday) => {
      const holidayDate = holiday.date instanceof Date ? formatDate(holiday.date) : String(holiday.date).slice(0, 10);
      return holidayDate === iso && holiday.isFullDay !== false;
    });
  }

  nextBusinessDay(date, calendar, direction = 1) {
    let current = new Date(date);
    let guard = 0;
    while (!this.isBusinessDay(current, calendar)) {
      current = addDays(current, direction);
      guard += 1;
      if (guard > 370) throw new Error('Holiday calendar adjustment exceeded safety limit.');
    }
    return current;
  }
}

module.exports = { HolidayCalendarService };
