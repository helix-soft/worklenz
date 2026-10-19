/* eslint-disable camelcase */

// Country holidays (except Sri Lanka, which has its own data source) were stored one day early
// for countries east of UTC (the UTC conversion of the local start date), and flagged recurring
// although each year has its own rows (so e.g. every year's Easter matched every year).
// Rebuild them from date-holidays using local dates, one non-recurring row per year.
// Countries selected in Holiday Settings with auto-sync on are (re)built as well.

const Holidays = require('date-holidays');

const START_YEAR = 2020;
const END_YEAR = 2050;

const literal = value => `'${String(value).replace(/'/g, "''")}'`;

const buildRows = countryCode => {
  const hd = new Holidays();
  hd.init(countryCode);
  hd.setLanguages('en');
  const seen = new Set();
  const rows = [];
  for (let year = START_YEAR; year <= END_YEAR; year++) {
    for (const holiday of hd.getHolidays(year) || []) {
      if (holiday.type !== 'public' || !holiday.date) continue;
      const date = holiday.date.slice(0, 10);
      const name = holiday.name || 'Unknown Holiday';
      const key = `${name}|${date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(`(${literal(countryCode)}, ${literal(name)}, 'public', ${literal(date)}, FALSE)`);
    }
  }
  return rows;
};

exports.up = async pgm => {
  const result = await pgm.db.query(`
    SELECT country_code FROM country_holidays WHERE country_code <> 'LK'
    UNION
    SELECT country_code FROM organization_holiday_settings
    WHERE auto_sync_holidays = TRUE AND country_code IS NOT NULL AND country_code <> 'LK'
  `);

  for (const { country_code: countryCode } of result.rows) {
    const code = String(countryCode).trim();
    if (!/^[A-Z]{2}$/.test(code)) continue;
    const rows = buildRows(code);
    pgm.sql(`DELETE FROM country_holidays WHERE country_code = ${literal(code)};`);
    if (rows.length) {
      pgm.sql(`
        INSERT INTO country_holidays (country_code, name, description, date, is_recurring)
        VALUES ${rows.join(',\n')}
        ON CONFLICT (country_code, name, date) DO NOTHING;
      `);
    }
  }
};

// The previous (shifted) data is not restorable; it is re-created on demand by the old code path.
exports.down = () => {};
