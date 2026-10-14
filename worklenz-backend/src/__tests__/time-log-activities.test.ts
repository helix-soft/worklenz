import { isTimeLogActivity, TIME_LOG_ACTIVITIES } from "../shared/time-log-activities";

describe("time log activities", () => {
  it("accepts every activity offered in the UI", () => {
    for (const activity of TIME_LOG_ACTIVITIES) {
      expect(isTimeLogActivity(activity)).toBe(true);
    }
  });

  it("rejects unknown values, other casings and non-strings", () => {
    expect(isTimeLogActivity("Development")).toBe(false);
    expect(isTimeLogActivity("other")).toBe(false);
    expect(isTimeLogActivity("")).toBe(false);
    expect(isTimeLogActivity(null)).toBe(false);
    expect(isTimeLogActivity(1)).toBe(false);
  });
});
