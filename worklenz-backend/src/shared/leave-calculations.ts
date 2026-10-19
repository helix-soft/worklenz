/**
 * Pure helpers for leave & attendance calculations (no DB access).
 * All dates are ISO calendar dates ("YYYY-MM-DD") and are handled in UTC so that
 * server timezone never shifts a day.
 */

export type TimeOffType = "vacation" | "sick";
export type WorkLocation = "office" | "remote";

export interface IWorkingDays {
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
}

export interface IHolidayDate {
  date: string;
  is_recurring: boolean;
}

export interface ITimeOffRange {
  start_date: string;
  end_date: string;
  type: TimeOffType | null;
  is_full_day: boolean;
}

export interface IWorkLocationDay {
  work_date: string;
  location: WorkLocation;
}

export interface IMonthlyAttendance {
  work_days: number;
  worked_days: number;
  meal_vouchers: number;
  /** Every approved full-day absence on a work day (vacation, personal, sick, other). */
  leave_days: number;
  office_days: number;
  remote_days: number;
  extra_worked_days: number;
}

/** Leave types that are deducted from the yearly allowance. A missing type counts as vacation. */
export const DEDUCTING_LEAVE_TYPES: ReadonlySet<string> = new Set(["vacation"]);

export const DEFAULT_WORKING_DAYS: IWorkingDays = {
  monday: true,
  tuesday: true,
  wednesday: true,
  thursday: true,
  friday: true,
  saturday: false,
  sunday: false,
};

const DAY_KEYS: (keyof IWorkingDays)[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isIsoDate = (value: unknown): value is string =>
  typeof value === "string" && ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

const toUtc = (date: string) => new Date(`${date}T00:00:00Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);

export const listDates = (start: string, end: string): string[] => {
  const dates: string[] = [];
  const cursor = toUtc(start);
  const last = toUtc(end);
  while (cursor <= last) {
    dates.push(toIso(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
};

export const monthRange = (year: number, month: number): { start: string; end: string } => {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start: toIso(start), end: toIso(end) };
};

export const yearRange = (year: number): { start: string; end: string } => ({
  start: `${year}-01-01`,
  end: `${year}-12-31`,
});

export const isLeaveDeducting = (type: string | null | undefined): boolean =>
  !type || DEDUCTING_LEAVE_TYPES.has(type);

/** Builds a predicate telling whether a date is an official work day (working weekday and not a holiday). */
export const createWorkDayChecker = (
  workingDays: IWorkingDays,
  holidays: IHolidayDate[],
): ((date: string) => boolean) => {
  const fixed = new Set<string>();
  const recurring = new Set<string>();
  for (const holiday of holidays) {
    if (holiday.is_recurring) recurring.add(holiday.date.slice(5, 10));
    else fixed.add(holiday.date.slice(0, 10));
  }

  return (date: string) => {
    const weekday = DAY_KEYS[toUtc(date).getUTCDay()];
    if (!workingDays[weekday]) return false;
    return !fixed.has(date) && !recurring.has(date.slice(5, 10));
  };
};

/** Maps each date covered by a full-day time-off entry to its type; partial days are ignored. */
export const expandTimeOff = (
  entries: ITimeOffRange[],
  rangeStart: string,
  rangeEnd: string,
): Map<string, TimeOffType> => {
  const days = new Map<string, TimeOffType>();
  for (const entry of entries) {
    if (!entry.is_full_day) continue;
    const start = entry.start_date > rangeStart ? entry.start_date : rangeStart;
    const end = entry.end_date < rangeEnd ? entry.end_date : rangeEnd;
    if (start > end) continue;
    for (const date of listDates(start, end)) {
      if (!days.has(date)) days.set(date, entry.type || "vacation");
    }
  }
  return days;
};

/** Number of work days in a range that a leave of the given dates would take. */
export const countWorkDays = (
  start: string,
  end: string,
  isWorkDay: (date: string) => boolean,
): number => listDates(start, end).filter(isWorkDay).length;

/** Number of allowance-deducting leave days (on work days) in the range. */
export const countDeductedLeaveDays = (
  entries: ITimeOffRange[],
  rangeStart: string,
  rangeEnd: string,
  isWorkDay: (date: string) => boolean,
): number => {
  let count = 0;
  for (const [date, type] of expandTimeOff(entries, rangeStart, rangeEnd)) {
    if (isWorkDay(date) && isLeaveDeducting(type)) count++;
  }
  return count;
};

/**
 * Monthly attendance of one member. Worked days = official work days minus any full-day absence,
 * which is also the meal voucher count. Office/remote come from the daily check-ins; a check-in on
 * a non-work day counts as an extra worked day (it does not raise meal vouchers).
 */
export const computeMonthlyAttendance = (params: {
  rangeStart: string;
  rangeEnd: string;
  isWorkDay: (date: string) => boolean;
  timeOff: ITimeOffRange[];
  locations: IWorkLocationDay[];
}): IMonthlyAttendance => {
  const { rangeStart, rangeEnd, isWorkDay, timeOff, locations } = params;
  const absences = expandTimeOff(timeOff, rangeStart, rangeEnd);
  const locationByDate = new Map(locations.map(l => [l.work_date, l.location]));

  const result: IMonthlyAttendance = {
    work_days: 0,
    worked_days: 0,
    meal_vouchers: 0,
    leave_days: 0,
    office_days: 0,
    remote_days: 0,
    extra_worked_days: 0,
  };

  for (const date of listDates(rangeStart, rangeEnd)) {
    const workDay = isWorkDay(date);
    const absence = absences.get(date);
    const location = locationByDate.get(date);

    if (location === "office") result.office_days++;
    if (location === "remote") result.remote_days++;

    if (!workDay) {
      if (location) result.extra_worked_days++;
      continue;
    }

    result.work_days++;
    if (absence) {
      result.leave_days++;
      continue;
    }

    result.worked_days++;
  }

  result.meal_vouchers = result.worked_days;
  return result;
};

export interface IAbsencePeriod {
  start: string;
  end: string;
  /** Work days inside the period. */
  days: number;
}

/**
 * Groups the work days a member was absent with the given type into periods. Weekends and holidays
 * between two absent work days do not break a period (Fri + Mon is one period of 2 days).
 */
export const buildAbsencePeriods = (params: {
  rangeStart: string;
  rangeEnd: string;
  isWorkDay: (date: string) => boolean;
  timeOff: ITimeOffRange[];
  type: TimeOffType;
}): IAbsencePeriod[] => {
  const { rangeStart, rangeEnd, isWorkDay, timeOff, type } = params;
  const absences = expandTimeOff(timeOff, rangeStart, rangeEnd);
  const periods: IAbsencePeriod[] = [];
  let current: IAbsencePeriod | null = null;

  for (const date of listDates(rangeStart, rangeEnd)) {
    if (!isWorkDay(date)) continue;
    if (absences.get(date) === type) {
      if (current) {
        current.end = date;
        current.days++;
      } else {
        current = { start: date, end: date, days: 1 };
        periods.push(current);
      }
    } else {
      current = null;
    }
  }
  return periods;
};
