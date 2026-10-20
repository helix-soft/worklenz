/* eslint-disable camelcase */

// Read-only Google Calendar integration: each user connects their own Google account and the
// events of all their calendars are synced into Worklenz (shown on Home → Calendar).
exports.up = pgm => {
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS google_calendar_connections (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      google_email TEXT,
      access_token_enc TEXT NOT NULL,
      refresh_token_enc TEXT,
      token_expires_at TIMESTAMPTZ,
      status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'needs_reauth')),
      last_synced_at TIMESTAMPTZ,
      last_sync_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS google_calendar_calendars (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      connection_id UUID NOT NULL REFERENCES google_calendar_connections(id) ON DELETE CASCADE,
      google_calendar_id TEXT NOT NULL,
      summary TEXT,
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT google_calendar_calendars_unique UNIQUE (connection_id, google_calendar_id)
    );

    CREATE TABLE IF NOT EXISTS google_calendar_events (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      connection_id UUID NOT NULL REFERENCES google_calendar_connections(id) ON DELETE CASCADE,
      calendar_id UUID NOT NULL REFERENCES google_calendar_calendars(id) ON DELETE CASCADE,
      google_event_id TEXT NOT NULL,
      title TEXT,
      description TEXT,
      location TEXT,
      is_all_day BOOLEAN NOT NULL DEFAULT FALSE,
      start_at TIMESTAMPTZ,
      end_at TIMESTAMPTZ,
      start_date DATE,
      end_date DATE,
      html_link TEXT,
      hangout_link TEXT,
      organizer_email TEXT,
      attendees JSONB NOT NULL DEFAULT '[]'::JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT google_calendar_events_unique UNIQUE (calendar_id, google_event_id),
      CONSTRAINT google_calendar_events_has_time CHECK (
        (is_all_day AND start_date IS NOT NULL AND end_date IS NOT NULL)
        OR (NOT is_all_day AND start_at IS NOT NULL AND end_at IS NOT NULL)
      )
    );
    CREATE INDEX IF NOT EXISTS idx_google_calendar_events_timed
      ON google_calendar_events (connection_id, start_at);
    CREATE INDEX IF NOT EXISTS idx_google_calendar_events_all_day
      ON google_calendar_events (connection_id, start_date);
  `);
};

exports.down = pgm => {
  pgm.sql(`
    DROP TABLE IF EXISTS google_calendar_events;
    DROP TABLE IF EXISTS google_calendar_calendars;
    DROP TABLE IF EXISTS google_calendar_connections;
  `);
};
