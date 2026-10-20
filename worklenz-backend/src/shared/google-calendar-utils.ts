import crypto from "crypto";

/** Pure helpers for the Google Calendar integration (no DB / network access). */

export interface IGoogleEventDateTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface IGoogleEventAttendee {
  email?: string;
  displayName?: string;
  self?: boolean;
  organizer?: boolean;
  responseStatus?: string;
}

export interface IGoogleConferenceData {
  entryPoints?: { entryPointType?: string; uri?: string }[];
}

export interface IGoogleEvent {
  id: string;
  iCalUID?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: IGoogleConferenceData;
  start?: IGoogleEventDateTime;
  end?: IGoogleEventDateTime;
  organizer?: { email?: string; displayName?: string };
  attendees?: IGoogleEventAttendee[];
}

export interface IMappedGoogleEvent {
  google_event_id: string;
  ical_uid: string | null;
  title: string | null;
  description: string | null;
  location: string | null;
  is_all_day: boolean;
  start_at: string | null;
  end_at: string | null;
  start_date: string | null;
  end_date: string | null;
  html_link: string | null;
  hangout_link: string | null;
  organizer_email: string | null;
  attendees: { email: string | null; name: string | null; response: string | null; organizer: boolean }[];
}

const MAX_TEXT_LENGTH = 5000;
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

const VIDEO_CALL_URL = /https?:\/\/[^\s<>"']*(zoom\.us|teams\.microsoft\.com|teams\.live\.com|meet\.google\.com|webex\.com)[^\s<>"']*/i;

/**
 * Video call link: Google Meet (hangoutLink), then a conference add-on's video entry point
 * (Zoom, Teams, …), then the first known meeting URL in the location or description.
 */
export const getVideoCallLink = (event: IGoogleEvent): string | null => {
  if (event.hangoutLink) return event.hangoutLink;
  const video = event.conferenceData?.entryPoints?.find(e => e.entryPointType === "video" && e.uri);
  if (video?.uri) return video.uri;
  const match = `${event.location || ""} ${event.description || ""}`.match(VIDEO_CALL_URL);
  return match ? match[0].replace(/&amp;/g, "&") : null;
};

const trimText = (value?: string) => (value ? value.slice(0, MAX_TEXT_LENGTH) : null);

/**
 * Converts a Google event into the stored shape. Returns null for events that should not be
 * shown: cancelled ones and invitations the user declined.
 * All-day events use Google's exclusive end date; it is stored inclusive (end - 1 day).
 */
export const mapGoogleEvent = (event: IGoogleEvent): IMappedGoogleEvent | null => {
  if (!event?.id || event.status === "cancelled") return null;
  if (event.attendees?.some(a => a.self && a.responseStatus === "declined")) return null;

  const isAllDay = Boolean(event.start?.date && !event.start?.dateTime);
  let startDate: string | null = null;
  let endDate: string | null = null;
  let startAt: string | null = null;
  let endAt: string | null = null;

  if (isAllDay) {
    startDate = event.start!.date!;
    const exclusiveEnd = event.end?.date || startDate;
    const end = new Date(`${exclusiveEnd}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() - 1);
    const inclusiveEnd = end.toISOString().slice(0, 10);
    endDate = inclusiveEnd < startDate ? startDate : inclusiveEnd;
  } else {
    if (!event.start?.dateTime) return null;
    startAt = new Date(event.start.dateTime).toISOString();
    endAt = new Date(event.end?.dateTime || event.start.dateTime).toISOString();
  }

  return {
    google_event_id: event.id,
    ical_uid: event.iCalUID || null,
    title: trimText(event.summary),
    description: trimText(event.description),
    location: trimText(event.location),
    is_all_day: isAllDay,
    start_at: startAt,
    end_at: endAt,
    start_date: startDate,
    end_date: endDate,
    html_link: event.htmlLink || null,
    hangout_link: getVideoCallLink(event),
    organizer_email: event.organizer?.email || null,
    attendees: (event.attendees || []).slice(0, 100).map(a => ({
      email: a.email || null,
      name: a.displayName || null,
      response: a.responseStatus || null,
      organizer: Boolean(a.organizer),
    })),
  };
};

const getStateSecret = () => {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for Google Calendar OAuth");
  return secret;
};

const hmac = (payload: string, secret: string) =>
  crypto.createHmac("sha256", secret).update(payload).digest("base64url");

/** OAuth `state` binding the callback to the user who started it: base64url(userId.issuedAt).signature */
export const signOAuthState = (userId: string, now = Date.now(), secret = getStateSecret()): string => {
  const payload = Buffer.from(`${userId}.${now}`).toString("base64url");
  return `${payload}.${hmac(payload, secret)}`;
};

/** Returns the user id when the state is authentic and not older than 10 minutes, otherwise null. */
export const verifyOAuthState = (
  state: string | undefined,
  now = Date.now(),
  secret = getStateSecret()
): string | null => {
  if (!state || typeof state !== "string") return null;
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;

  const expected = hmac(payload, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const [userId, issuedAt] = Buffer.from(payload, "base64url").toString().split(".");
  const issued = Number(issuedAt);
  if (!userId || !Number.isFinite(issued) || now - issued > STATE_MAX_AGE_MS || issued > now + 60_000) return null;
  return userId;
};

/** Sync window: one month back, six months ahead. */
export const getSyncWindow = (now = new Date()) => {
  const start = new Date(now);
  start.setUTCMonth(start.getUTCMonth() - 1);
  const end = new Date(now);
  end.setUTCMonth(end.getUTCMonth() + 6);
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
};
