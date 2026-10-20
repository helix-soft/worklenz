import { mapGoogleEvent, signOAuthState, verifyOAuthState } from "../shared/google-calendar-utils";

describe("google calendar event mapping", () => {
  it("maps a timed event to UTC instants", () => {
    const event = mapGoogleEvent({
      id: "e1",
      summary: "Spring Art Exhibition",
      start: { dateTime: "2026-10-20T09:50:00+03:00" },
      end: { dateTime: "2026-10-20T11:50:00+03:00" },
      hangoutLink: "https://meet.google.com/abc",
    });
    expect(event).toMatchObject({
      google_event_id: "e1",
      title: "Spring Art Exhibition",
      is_all_day: false,
      start_at: "2026-10-20T06:50:00.000Z",
      end_at: "2026-10-20T08:50:00.000Z",
      start_date: null,
      hangout_link: "https://meet.google.com/abc",
    });
  });

  it("stores an all-day event with an inclusive end date", () => {
    const event = mapGoogleEvent({
      id: "e2",
      summary: "Conference",
      start: { date: "2026-10-22" },
      end: { date: "2026-10-24" }, // Google's end date is exclusive
    });
    expect(event).toMatchObject({ is_all_day: true, start_date: "2026-10-22", end_date: "2026-10-23", start_at: null });
  });

  it("keeps a one-day all-day event on its own day", () => {
    const event = mapGoogleEvent({ id: "e3", start: { date: "2026-12-25" }, end: { date: "2026-12-26" } });
    expect(event).toMatchObject({ start_date: "2026-12-25", end_date: "2026-12-25" });
  });

  it("skips cancelled events and invitations the user declined", () => {
    expect(mapGoogleEvent({ id: "c", status: "cancelled", start: { date: "2026-10-20" } })).toBeNull();
    expect(
      mapGoogleEvent({
        id: "d",
        start: { dateTime: "2026-10-20T10:00:00Z" },
        end: { dateTime: "2026-10-20T11:00:00Z" },
        attendees: [{ email: "me@x.ro", self: true, responseStatus: "declined" }],
      })
    ).toBeNull();
    expect(
      mapGoogleEvent({
        id: "a",
        start: { dateTime: "2026-10-20T10:00:00Z" },
        end: { dateTime: "2026-10-20T11:00:00Z" },
        attendees: [
          { email: "me@x.ro", self: true, responseStatus: "accepted" },
          { email: "other@x.ro", responseStatus: "declined" },
        ],
      })
    ).not.toBeNull();
  });
});

describe("google calendar oauth state", () => {
  const secret = "test-secret";
  const now = Date.parse("2026-10-20T10:00:00Z");

  it("round-trips the user id", () => {
    const state = signOAuthState("user-1", now, secret);
    expect(verifyOAuthState(state, now + 1000, secret)).toBe("user-1");
  });

  it("rejects a tampered or foreign state", () => {
    const state = signOAuthState("user-1", now, secret);
    const [, signature] = state.split(".");
    const forged = `${Buffer.from(`user-2.${now}`).toString("base64url")}.${signature}`;
    expect(verifyOAuthState(forged, now, secret)).toBeNull();
    expect(verifyOAuthState(state, now, "other-secret")).toBeNull();
    expect(verifyOAuthState("garbage", now, secret)).toBeNull();
    expect(verifyOAuthState(undefined, now, secret)).toBeNull();
  });

  it("rejects an expired state", () => {
    const state = signOAuthState("user-1", now, secret);
    expect(verifyOAuthState(state, now + 11 * 60 * 1000, secret)).toBeNull();
  });
});
