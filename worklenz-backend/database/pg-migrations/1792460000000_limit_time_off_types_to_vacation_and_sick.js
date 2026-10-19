/* eslint-disable camelcase */

// Only vacation and sick leave are tracked. Existing personal/other entries become vacation.
exports.up = pgm => {
  pgm.sql(`
    UPDATE member_time_off SET type = 'vacation' WHERE type IN ('personal', 'other');
    UPDATE member_leave_requests SET type = 'vacation' WHERE type IN ('personal', 'other');

    ALTER TABLE member_time_off DROP CONSTRAINT IF EXISTS member_time_off_type_check;
    ALTER TABLE member_time_off ADD CONSTRAINT member_time_off_type_check
      CHECK (type IS NULL OR type IN ('vacation', 'sick'));

    ALTER TABLE member_leave_requests DROP CONSTRAINT IF EXISTS member_leave_requests_type_check;
    ALTER TABLE member_leave_requests ADD CONSTRAINT member_leave_requests_type_check
      CHECK (type IN ('vacation', 'sick'));
  `);
};

exports.down = pgm => {
  pgm.sql(`
    ALTER TABLE member_time_off DROP CONSTRAINT IF EXISTS member_time_off_type_check;
    ALTER TABLE member_time_off ADD CONSTRAINT member_time_off_type_check
      CHECK (type IS NULL OR type IN ('vacation', 'sick', 'personal', 'other'));

    ALTER TABLE member_leave_requests DROP CONSTRAINT IF EXISTS member_leave_requests_type_check;
    ALTER TABLE member_leave_requests ADD CONSTRAINT member_leave_requests_type_check
      CHECK (type IN ('vacation', 'personal', 'sick', 'other'));
  `);
};
