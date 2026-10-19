jest.mock("../config/db", () => ({ __esModule: true, default: { query: jest.fn() } }));

import { buildPublicHolidayRows } from "../services/country-holidays";

describe("country holidays", () => {
  it("keeps Romanian public holidays on their local date", () => {
    const dates = buildPublicHolidayRows("RO", 2026).map(row => row.date);

    expect(dates).toEqual(
      expect.arrayContaining([
        "2026-01-01",
        "2026-01-24",
        "2026-04-10", // Orthodox Good Friday
        "2026-04-13", // Orthodox Easter Monday
        "2026-12-01",
        "2026-12-25",
      ])
    );
    expect(dates).not.toContain("2025-12-31");
    expect(dates).not.toContain("2026-12-24");
  });

  it("returns no rows for an unknown country", () => {
    expect(buildPublicHolidayRows("XX", 2026)).toEqual([]);
  });
});
