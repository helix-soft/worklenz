import {
  buildAbsencePeriods,
  computeMonthlyAttendance,
  countDeductedLeaveDays,
  countWorkDays,
  createWorkDayChecker,
  DEFAULT_WORKING_DAYS,
  isIsoDate,
  monthRange,
} from "../shared/leave-calculations";

// January 2026: 1st Thu (holiday), 2nd Fri (holiday), 6th-7th Tue-Wed (Epiphany / St John, recurring)
const holidays = [
  { date: "2026-01-01", is_recurring: false },
  { date: "2026-01-02", is_recurring: false },
  { date: "2020-01-06", is_recurring: true },
  { date: "2026-01-07", is_recurring: false },
];
const isWorkDay = createWorkDayChecker(DEFAULT_WORKING_DAYS, holidays);
const { start, end } = monthRange(2026, 1);

describe("leave calculations", () => {
  it("counts official work days without weekends and holidays", () => {
    // 22 weekdays in January 2026 minus 4 holidays
    expect(countWorkDays(start, end, isWorkDay)).toBe(18);
    expect(isWorkDay("2026-01-06")).toBe(false);
    expect(isWorkDay("2026-01-03")).toBe(false);
    expect(isWorkDay("2026-01-05")).toBe(true);
  });

  it("deducts only vacation full days that fall on work days", () => {
    const entries = [
      { start_date: "2026-01-05", end_date: "2026-01-11", type: "vacation" as const, is_full_day: true },
      { start_date: "2026-01-12", end_date: "2026-01-12", type: "sick" as const, is_full_day: true },
      { start_date: "2026-01-13", end_date: "2026-01-13", type: null, is_full_day: true },
      { start_date: "2026-01-14", end_date: "2026-01-14", type: "vacation" as const, is_full_day: false },
    ];
    // 5th, 8th, 9th (6th/7th holidays, 10th/11th weekend) + 13th
    expect(countDeductedLeaveDays(entries, start, end, isWorkDay)).toBe(4);
  });

  it("computes monthly attendance and meal vouchers", () => {
    const result = computeMonthlyAttendance({
      rangeStart: start,
      rangeEnd: end,
      isWorkDay,
      timeOff: [
        { start_date: "2026-01-05", end_date: "2026-01-05", type: "vacation", is_full_day: true },
        { start_date: "2026-01-12", end_date: "2026-01-13", type: "sick", is_full_day: true },
      ],
      locations: [
        { work_date: "2026-01-08", location: "office" },
        { work_date: "2026-01-09", location: "remote" },
        { work_date: "2026-01-10", location: "remote" }, // Saturday
      ],
    });

    expect(result.work_days).toBe(18);
    // vacation (1) and sick (2) both count as leave days
    expect(result.leave_days).toBe(3);
    expect(result.worked_days).toBe(15);
    expect(result.meal_vouchers).toBe(15);
    expect(result.office_days).toBe(1);
    expect(result.remote_days).toBe(2);
    expect(result.extra_worked_days).toBe(1);
  });

  it("groups absences into periods across weekends and holidays", () => {
    const periods = buildAbsencePeriods({
      rangeStart: start,
      rangeEnd: end,
      isWorkDay,
      type: "vacation",
      timeOff: [
        // Mon 5th, then 6th/7th holidays, Thu 8th, Fri 9th, weekend, Mon 12th
        { start_date: "2026-01-05", end_date: "2026-01-12", type: "vacation", is_full_day: true },
        { start_date: "2026-01-14", end_date: "2026-01-14", type: "sick", is_full_day: true },
        { start_date: "2026-01-20", end_date: "2026-01-20", type: null, is_full_day: true },
      ],
    });
    expect(periods).toEqual([
      { start: "2026-01-05", end: "2026-01-12", days: 4 },
      { start: "2026-01-20", end: "2026-01-20", days: 1 },
    ]);
  });

  it("validates ISO dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-2-28")).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });
});
