/* eslint-disable camelcase */

// Activity type of a time log (Development, Meeting, ...). Nullable: logs created before
// this column, or from forms that don't ask for it, have no activity.
exports.up = pgm => {
  pgm.sql(`
    ALTER TABLE task_work_log ADD COLUMN IF NOT EXISTS activity VARCHAR(32);

    ALTER TABLE task_work_log DROP CONSTRAINT IF EXISTS task_work_log_activity_check;
    ALTER TABLE task_work_log ADD CONSTRAINT task_work_log_activity_check
      CHECK (activity IS NULL OR activity IN (
        'development', 'specification', 'management', 'testing', 'support', 'pr', 'meeting'
      ));
  `);
};

exports.down = pgm => {
  pgm.sql(`
    ALTER TABLE task_work_log DROP CONSTRAINT IF EXISTS task_work_log_activity_check;
    ALTER TABLE task_work_log DROP COLUMN IF EXISTS activity;
  `);
};
