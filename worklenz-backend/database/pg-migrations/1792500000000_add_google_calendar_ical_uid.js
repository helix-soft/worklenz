/* eslint-disable camelcase */

// iCalUID (RFC 5545) of synced Google events, used to open an event in Notion Calendar
// (cron://showEvent deep link). Filled on the next sync.

exports.up = pgm => {
  pgm.addColumn("google_calendar_events", { ical_uid: { type: "text" } });
};

exports.down = pgm => {
  pgm.dropColumn("google_calendar_events", "ical_uid");
};
