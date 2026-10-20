import { CronJob } from "cron";
import { PoolClient } from "pg";

import db from "../config/db";
import { log_error } from "../shared/utils";
import { isGoogleCalendarConfigured, syncConnection } from "../services/google-calendar.service";

const TIME = process.env.GOOGLE_CALENDAR_SYNC_INTERVAL || "*/15 * * * *";
const ADVISORY_LOCK_ID = 900230;

const log = (value: string) => console.log("google-calendar-sync-job:", value);

/** Re-syncs every active Google Calendar connection, one at a time; one instance at a time cluster-wide. */
async function onSyncTick(): Promise<void> {
  if (!isGoogleCalendarConfigured()) return;

  let lockClient: PoolClient | null = null;
  let locked = false;
  try {
    lockClient = await db.pool.connect();
    const lock = await lockClient.query("SELECT pg_try_advisory_lock($1) AS acquired;", [ADVISORY_LOCK_ID]);
    locked = lock.rows[0]?.acquired === true;
    if (!locked) return;

    const connections = await db.query(`SELECT id FROM google_calendar_connections WHERE status = 'active'`);
    let failed = 0;
    for (const { id } of connections.rows) {
      try {
        await syncConnection(id);
      } catch {
        failed++; // Stored on the connection by syncConnection.
      }
    }
    if (connections.rows.length) {
      log(`Synced ${connections.rows.length - failed}/${connections.rows.length} connection(s).`);
    }
  } catch (error) {
    log_error(error);
  } finally {
    if (lockClient) {
      if (locked) {
        try {
          await lockClient.query("SELECT pg_advisory_unlock($1);", [ADVISORY_LOCK_ID]);
        } catch (error) {
          log_error(error);
        }
      }
      lockClient.release();
    }
  }
}

export function startGoogleCalendarSyncJob() {
  log("(cron) Google Calendar sync job ready.");
  const job = new CronJob(TIME, () => void onSyncTick(), null, true);
  job.start();
}
