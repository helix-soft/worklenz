/* eslint-disable camelcase */

// Logging time from calendar events (Home → Log Time week view):
// - task_work_log.google_event_id links a log to the Google Calendar event it was logged for,
//   so the event's placeholder disappears once it has been logged.
// - tasks.system_kind marks the per-project "Meetings" task that calendar events are logged to
//   (one per project, created on first use).
// - New activity types for meeting-like events: demo, workshop, training, interview.

const OLD_ACTIVITIES = ["development", "specification", "management", "testing", "support", "pr", "meeting"];
const NEW_ACTIVITIES = [...OLD_ACTIVITIES, "demo", "workshop", "training", "interview"];

const activityCheck = activities =>
  `activity IS NULL OR activity::text = ANY (ARRAY[${activities.map(a => `'${a}'`).join(", ")}]::text[])`;

exports.up = pgm => {
  pgm.addColumn("task_work_log", { google_event_id: { type: "text" } });
  pgm.createIndex("task_work_log", ["user_id", "google_event_id"], {
    name: "idx_task_work_log_user_google_event",
    where: "google_event_id IS NOT NULL",
  });

  pgm.addColumn("tasks", { system_kind: { type: "varchar(32)" } });
  pgm.createIndex("tasks", ["project_id", "system_kind"], {
    name: "uq_tasks_project_system_kind",
    unique: true,
    where: "system_kind IS NOT NULL",
  });

  pgm.dropConstraint("task_work_log", "task_work_log_activity_check");
  pgm.addConstraint("task_work_log", "task_work_log_activity_check", { check: activityCheck(NEW_ACTIVITIES) });
};

exports.down = pgm => {
  pgm.sql(`UPDATE task_work_log SET activity = 'meeting' WHERE activity IN ('demo', 'workshop', 'training', 'interview')`);
  pgm.dropConstraint("task_work_log", "task_work_log_activity_check");
  pgm.addConstraint("task_work_log", "task_work_log_activity_check", { check: activityCheck(OLD_ACTIVITIES) });

  pgm.dropIndex("tasks", ["project_id", "system_kind"], { name: "uq_tasks_project_system_kind" });
  pgm.dropColumn("tasks", "system_kind");

  pgm.dropIndex("task_work_log", ["user_id", "google_event_id"], { name: "idx_task_work_log_user_google_event" });
  pgm.dropColumn("task_work_log", "google_event_id");
};
