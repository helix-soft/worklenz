import db from "../config/db";
import { EncryptionService } from "./encryption.service";
import { log_error } from "../shared/utils";
import { getSyncWindow, IGoogleEvent, mapGoogleEvent, signOAuthState } from "../shared/google-calendar-utils";

/**
 * Read-only Google Calendar sync. Talks to Google's REST API with plain fetch; tokens are stored
 * encrypted (EncryptionService). Every user has at most one connection.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.readonly"];
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_EVENT_PAGES = 20;

/** Google rejected the refresh token: the user must connect again. */
export class GoogleReauthRequiredError extends Error {}

interface ITokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface IConnectionRow {
  id: string;
  user_id: string;
  access_token_enc: string;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
  status: string;
}

const getConfig = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_CALENDAR_REDIRECT_URI || `${process.env.APP_URL}/public/google-calendar/oauth/callback`;
  return { clientId, clientSecret, redirectUri };
};

export const isGoogleCalendarConfigured = () => {
  const { clientId, clientSecret } = getConfig();
  return Boolean(clientId && clientSecret && !clientId.startsWith("your_") && !clientSecret.startsWith("your_"));
};

const fetchJson = async <T>(url: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; body: T }> => {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const text = await response.text();
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text.slice(0, 200) };
  }
  return { ok: response.ok, status: response.status, body };
};

const postForm = (url: string, params: Record<string, string>) =>
  fetchJson<ITokenResponse>(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });

export const buildAuthUrl = (userId: string): string => {
  const { clientId, redirectUri } = getConfig();
  const params = new URLSearchParams({
    client_id: clientId as string,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: signOAuthState(userId),
  });
  return `${AUTH_URL}?${params.toString()}`;
};

/** Exchanges the OAuth code, stores the connection and returns its id. */
export const connectWithCode = async (userId: string, code: string): Promise<string> => {
  const { clientId, clientSecret, redirectUri } = getConfig();
  const token = await postForm(TOKEN_URL, {
    code,
    client_id: clientId as string,
    client_secret: clientSecret as string,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  if (!token.ok || !token.body.access_token) {
    throw new Error(`Google token exchange failed: ${token.body.error || token.status}`);
  }

  const userInfo = await fetchJson<{ email?: string }>(USERINFO_URL, {
    headers: { Authorization: `Bearer ${token.body.access_token}` },
  });

  const expiresAt = new Date(Date.now() + (token.body.expires_in || 3600) * 1000).toISOString();
  const result = await db.query(
    `INSERT INTO google_calendar_connections
       (user_id, google_email, access_token_enc, refresh_token_enc, token_expires_at, status, last_sync_error)
     VALUES ($1, $2, $3, $4, $5, 'active', NULL)
     ON CONFLICT (user_id) DO UPDATE SET
       google_email = EXCLUDED.google_email,
       access_token_enc = EXCLUDED.access_token_enc,
       refresh_token_enc = COALESCE(EXCLUDED.refresh_token_enc, google_calendar_connections.refresh_token_enc),
       token_expires_at = EXCLUDED.token_expires_at,
       status = 'active',
       last_sync_error = NULL,
       updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [
      userId,
      userInfo.body.email || null,
      EncryptionService.encrypt(token.body.access_token),
      token.body.refresh_token ? EncryptionService.encrypt(token.body.refresh_token) : null,
      expiresAt,
    ]
  );
  return result.rows[0].id;
};

/** Returns a valid access token, refreshing it when it expires within a minute. */
const getAccessToken = async (connection: IConnectionRow): Promise<string> => {
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  if (expiresAt - Date.now() > 60_000) return EncryptionService.decrypt(connection.access_token_enc);

  if (!connection.refresh_token_enc) throw new GoogleReauthRequiredError("Missing refresh token");
  const { clientId, clientSecret } = getConfig();
  const token = await postForm(TOKEN_URL, {
    client_id: clientId as string,
    client_secret: clientSecret as string,
    refresh_token: EncryptionService.decrypt(connection.refresh_token_enc),
    grant_type: "refresh_token",
  });
  if (token.body.error === "invalid_grant") throw new GoogleReauthRequiredError("Refresh token revoked or expired");
  if (!token.ok || !token.body.access_token) {
    throw new Error(`Google token refresh failed: ${token.body.error || token.status}`);
  }

  const newExpiresAt = new Date(Date.now() + (token.body.expires_in || 3600) * 1000).toISOString();
  await db.query(
    `UPDATE google_calendar_connections
     SET access_token_enc = $2, token_expires_at = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [connection.id, EncryptionService.encrypt(token.body.access_token), newExpiresAt]
  );
  return token.body.access_token;
};

const googleGet = async <T>(path: string, accessToken: string): Promise<T> => {
  const response = await fetchJson<T & { error?: { message?: string } }>(`${CALENDAR_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 401) throw new GoogleReauthRequiredError("Google rejected the access token");
  if (!response.ok) {
    throw new Error(`Google Calendar API error ${response.status}: ${response.body.error?.message || ""}`.trim());
  }
  return response.body;
};

const listCalendars = async (accessToken: string) => {
  const calendars: { id: string; summary?: string; primary?: boolean }[] = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({ maxResults: "250", ...(pageToken ? { pageToken } : {}) });
    const page = await googleGet<{ items?: typeof calendars; nextPageToken?: string }>(
      `/users/me/calendarList?${query.toString()}`,
      accessToken
    );
    calendars.push(...(page.items || []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return calendars;
};

const listEvents = async (calendarId: string, accessToken: string, timeMin: string, timeMax: string) => {
  const events: IGoogleEvent[] = [];
  let pageToken: string | undefined;
  let pages = 0;
  do {
    const query = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "2500",
      timeMin,
      timeMax,
      ...(pageToken ? { pageToken } : {}),
    });
    const page = await googleGet<{ items?: IGoogleEvent[]; nextPageToken?: string }>(
      `/calendars/${encodeURIComponent(calendarId)}/events?${query.toString()}`,
      accessToken
    );
    events.push(...(page.items || []));
    pageToken = page.nextPageToken;
    pages++;
  } while (pageToken && pages < MAX_EVENT_PAGES);
  return events;
};

/** Pulls all calendars and their events in the sync window and replaces the stored copy. */
export const syncConnection = async (connectionId: string): Promise<void> => {
  const result = await db.query(`SELECT * FROM google_calendar_connections WHERE id = $1`, [connectionId]);
  const connection: IConnectionRow | undefined = result.rows[0];
  if (!connection) return;

  try {
    const accessToken = await getAccessToken(connection);
    const { timeMin, timeMax } = getSyncWindow();
    const calendars = await listCalendars(accessToken);

    // Fetch everything first so a Google error never leaves a half-replaced calendar behind.
    const calendarEvents = [];
    for (const calendar of calendars) {
      const events = await listEvents(calendar.id, accessToken, timeMin, timeMax);
      calendarEvents.push({ calendar, events: events.map(mapGoogleEvent).filter(Boolean) });
    }

    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM google_calendar_calendars WHERE connection_id = $1 AND NOT (google_calendar_id = ANY($2::TEXT[]))`,
        [connectionId, calendars.map(c => c.id)]
      );
      for (const { calendar, events } of calendarEvents) {
        const calendarRow = await client.query(
          `INSERT INTO google_calendar_calendars (connection_id, google_calendar_id, summary, is_primary)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (connection_id, google_calendar_id)
           DO UPDATE SET summary = EXCLUDED.summary, is_primary = EXCLUDED.is_primary
           RETURNING id`,
          [connectionId, calendar.id, calendar.summary || null, Boolean(calendar.primary)]
        );
        const calendarId = calendarRow.rows[0].id;
        await client.query(`DELETE FROM google_calendar_events WHERE calendar_id = $1`, [calendarId]);
        for (const event of events) {
          if (!event) continue;
          await client.query(
            `INSERT INTO google_calendar_events
               (connection_id, calendar_id, google_event_id, title, description, location, is_all_day,
                start_at, end_at, start_date, end_date, html_link, hangout_link, organizer_email, attendees,
                ical_uid)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             ON CONFLICT (calendar_id, google_event_id) DO NOTHING`,
            [
              connectionId,
              calendarId,
              event.google_event_id,
              event.title,
              event.description,
              event.location,
              event.is_all_day,
              event.start_at,
              event.end_at,
              event.start_date,
              event.end_date,
              event.html_link,
              event.hangout_link,
              event.organizer_email,
              JSON.stringify(event.attendees),
              event.ical_uid,
            ]
          );
        }
      }
      await client.query(
        `UPDATE google_calendar_connections
         SET last_synced_at = CURRENT_TIMESTAMP, last_sync_error = NULL, status = 'active', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [connectionId]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    const isReauth = error instanceof GoogleReauthRequiredError;
    await db.query(
      `UPDATE google_calendar_connections
       SET last_sync_error = $2, status = CASE WHEN $3 THEN 'needs_reauth' ELSE status END, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [connectionId, String((error as Error)?.message || error).slice(0, 500), isReauth]
    );
    if (!isReauth) log_error(error);
    throw error;
  }
};

/** Revokes the Google grant (best effort) and deletes the connection with all synced data. */
export const disconnect = async (userId: string): Promise<void> => {
  const result = await db.query(
    `SELECT refresh_token_enc, access_token_enc FROM google_calendar_connections WHERE user_id = $1`,
    [userId]
  );
  const row = result.rows[0];
  if (row) {
    try {
      const token = EncryptionService.decrypt(row.refresh_token_enc || row.access_token_enc);
      await postForm(REVOKE_URL, { token });
    } catch (error) {
      log_error(error);
    }
  }
  await db.query(`DELETE FROM google_calendar_connections WHERE user_id = $1`, [userId]);
};
