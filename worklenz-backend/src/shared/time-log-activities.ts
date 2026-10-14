/** Activity types a time log can be tagged with. Must match the task_work_log_activity_check constraint. */
export const TIME_LOG_ACTIVITIES = [
  "development",
  "specification",
  "management",
  "testing",
  "support",
  "pr",
  "meeting",
] as const;

export type TimeLogActivity = (typeof TIME_LOG_ACTIVITIES)[number];

export const isTimeLogActivity = (value: unknown): value is TimeLogActivity =>
  typeof value === "string" && (TIME_LOG_ACTIVITIES as readonly string[]).includes(value);
