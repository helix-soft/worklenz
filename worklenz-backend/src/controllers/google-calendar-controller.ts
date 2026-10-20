import db from "../config/db";
import HandleExceptions from "../decorators/handle-exceptions";
import { IWorkLenzRequest } from "../interfaces/worklenz-request";
import { IWorkLenzResponse } from "../interfaces/worklenz-response";
import { ServerResponse } from "../models/server-response";
import WorklenzControllerBase from "./worklenz-controller-base";
import { isIsoDate } from "../shared/leave-calculations";
import { verifyOAuthState } from "../shared/google-calendar-utils";
import { log_error } from "../shared/utils";
import {
  buildAuthUrl,
  connectWithCode,
  disconnect,
  isGoogleCalendarConfigured,
  syncConnection,
} from "../services/google-calendar.service";

const MANUAL_SYNC_COOLDOWN_MS = 30_000;
const MAX_EVENTS_RANGE_DAYS = 400;
const lastManualSync = new Map<string, number>();

const frontendUrl = () =>
  (process.env.FRONTEND_URL || process.env.APP_URL || "http://localhost:5173").replace(/\/+$/, "");

export default class GoogleCalendarController extends WorklenzControllerBase {
  private static async getStatusBody(userId: string) {
    const result = await db.query(
      `SELECT c.google_email, c.status, c.last_synced_at, c.last_sync_error,
              (SELECT COUNT(*)::INT FROM google_calendar_calendars gc WHERE gc.connection_id = c.id) AS calendars_count
       FROM google_calendar_connections c
       WHERE c.user_id = $1`,
      [userId]
    );
    const row = result.rows[0];
    return {
      configured: isGoogleCalendarConfigured(),
      connected: Boolean(row),
      google_email: row?.google_email ?? null,
      status: row?.status ?? null,
      last_synced_at: row?.last_synced_at ?? null,
      last_sync_error: row?.last_sync_error ?? null,
      calendars_count: row?.calendars_count ?? 0,
    };
  }

  @HandleExceptions()
  public static async getStatus(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    return res.status(200).send(new ServerResponse(true, await GoogleCalendarController.getStatusBody(req.user?.id as string)));
  }

  @HandleExceptions()
  public static async getAuthUrl(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    if (!isGoogleCalendarConfigured()) {
      return res.status(400).send(new ServerResponse(false, null, "Google Calendar is not configured on this server"));
    }
    return res.status(200).send(new ServerResponse(true, { url: buildAuthUrl(req.user?.id as string) }));
  }

  @HandleExceptions()
  public static async sync(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const userId = req.user?.id as string;
    const connection = await db.query(`SELECT id FROM google_calendar_connections WHERE user_id = $1`, [userId]);
    if (!connection.rows.length) {
      return res.status(404).send(new ServerResponse(false, null, "Google Calendar is not connected"));
    }

    const last = lastManualSync.get(userId) || 0;
    if (Date.now() - last >= MANUAL_SYNC_COOLDOWN_MS) {
      lastManualSync.set(userId, Date.now());
      try {
        await syncConnection(connection.rows[0].id);
      } catch {
        // The error is stored on the connection and returned in the status below.
      }
    }
    return res.status(200).send(new ServerResponse(true, await GoogleCalendarController.getStatusBody(userId)));
  }

  @HandleExceptions()
  public static async disconnect(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    await disconnect(req.user?.id as string);
    return res.status(200).send(new ServerResponse(true, null));
  }

  /** The current user's events overlapping [start, end] (inclusive dates). */
  @HandleExceptions()
  public static async getEvents(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse> {
    const { start, end } = req.query;
    if (!isIsoDate(start) || !isIsoDate(end) || end < start) {
      return res.status(400).send(new ServerResponse(false, null, "Valid start and end dates are required"));
    }
    const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
    if (days > MAX_EVENTS_RANGE_DAYS) {
      return res.status(400).send(new ServerResponse(false, null, "Date range is too long"));
    }

    // Timed events are compared with a one-day margin on both ends; the client places them in
    // the viewer's own timezone.
    const result = await db.query(
      `SELECT e.id, e.title, e.description, e.location, e.is_all_day,
              e.start_at, e.end_at, to_char(e.start_date, 'YYYY-MM-DD') AS start_date,
              to_char(e.end_date, 'YYYY-MM-DD') AS end_date, e.html_link, e.hangout_link,
              e.organizer_email, e.attendees, gc.id AS calendar_id, gc.summary AS calendar_name,
              gc.is_primary AS calendar_is_primary, e.ical_uid, c.google_email AS account_email
       FROM google_calendar_events e
       JOIN google_calendar_connections c ON c.id = e.connection_id
       JOIN google_calendar_calendars gc ON gc.id = e.calendar_id
       WHERE c.user_id = $1
         AND (
           (e.is_all_day AND e.start_date <= $3::DATE AND e.end_date >= $2::DATE)
           OR (NOT e.is_all_day AND e.start_at < ($3::DATE + INTERVAL '2 days') AND e.end_at > ($2::DATE - INTERVAL '1 day'))
         )
       ORDER BY e.is_all_day DESC, COALESCE(e.start_at, e.start_date::TIMESTAMPTZ)
       LIMIT 2000`,
      [req.user?.id, start, end]
    );
    return res.status(200).send(new ServerResponse(true, result.rows));
  }

  /** Public OAuth redirect target: stores the connection, runs the first sync, returns to Settings. */
  @HandleExceptions()
  public static async oauthCallback(req: IWorkLenzRequest, res: IWorkLenzResponse): Promise<IWorkLenzResponse | void> {
    const target = `${frontendUrl()}/worklenz/settings/integrations`;
    const { code, state, error } = req.query as Record<string, string | undefined>;
    const userId = verifyOAuthState(state);

    if (error || !code || !userId) {
      return res.redirect(`${target}?googleCalendar=error`);
    }

    try {
      const connectionId = await connectWithCode(userId, code);
      try {
        await syncConnection(connectionId);
      } catch {
        // Stored on the connection; the Settings card shows it.
      }
      return res.redirect(`${target}?googleCalendar=connected`);
    } catch (err) {
      log_error(err);
      return res.redirect(`${target}?googleCalendar=error`);
    }
  }
}
