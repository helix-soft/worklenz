import Holidays from "date-holidays";
import db from "../config/db";

export const COUNTRY_HOLIDAY_POPULATE_START_YEAR = 2020;
export const COUNTRY_HOLIDAY_POPULATE_END_YEAR = 2050;

interface DateHolidayEntry {
  type?: string;
  /** Local calendar date in the country's timezone, e.g. "2026-12-25 00:00:00". */
  date?: string;
  name?: string;
}

export interface ICountryHolidayRow {
  name: string;
  description: string;
  date: string;
}

/**
 * Official (public) holidays of a country for one year.
 * Uses the library's local `date` string: converting `start` to UTC shifts the day for
 * countries east of UTC (e.g. Romania's 25 Dec would become 24 Dec).
 */
export const buildPublicHolidayRows = (countryCode: string, year: number): ICountryHolidayRow[] => {
  const hd = new Holidays();
  hd.init(countryCode);
  hd.setLanguages("en");

  const holidays = (hd.getHolidays(year) || []) as DateHolidayEntry[];
  const seen = new Set<string>();
  const rows: ICountryHolidayRow[] = [];

  for (const holiday of holidays) {
    if (holiday.type !== "public" || !holiday.date) continue;
    const date = holiday.date.slice(0, 10);
    const name = holiday.name || "Unknown Holiday";
    const key = `${name}|${date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ name, description: "public", date });
  }
  return rows;
};

/**
 * Stores a country's public holidays for the given years. Each year gets its own rows, so they are
 * not recurring (movable feasts like Easter differ every year).
 */
export const insertPublicHolidaysForCountry = async (
  countryCode: string,
  startYear = COUNTRY_HOLIDAY_POPULATE_START_YEAR,
  endYear = COUNTRY_HOLIDAY_POPULATE_END_YEAR
): Promise<number> => {
  const insertQuery = `
    INSERT INTO country_holidays (country_code, name, description, date, is_recurring)
    VALUES ($1, $2, $3, $4, FALSE)
    ON CONFLICT (country_code, name, date) DO NOTHING
  `;

  let totalPopulated = 0;
  for (let year = startYear; year <= endYear; year++) {
    for (const row of buildPublicHolidayRows(countryCode, year)) {
      await db.query(insertQuery, [countryCode, row.name, row.description, row.date]);
      totalPopulated++;
    }
  }
  return totalPopulated;
};

/** Fills country_holidays for a country if it has none yet (Sri Lanka has its own data source). */
export const ensureCountryHolidays = async (countryCode: string): Promise<number> => {
  if (!countryCode || countryCode === "LK") return 0;
  const existing = await db.query(`SELECT 1 FROM country_holidays WHERE country_code = $1 LIMIT 1`, [
    countryCode,
  ]);
  if (existing.rows.length) return 0;
  return insertPublicHolidaysForCountry(countryCode);
};
