/* eslint-disable camelcase */

// Leave is only taken in whole days, so allowances and extra days are whole numbers.
// Extra-day adjustments can be edited by leadership; the last editor is recorded.
exports.up = pgm => {
  pgm.sql(`
    UPDATE member_leave_allowances SET base_days = ROUND(base_days) WHERE base_days <> ROUND(base_days);
    UPDATE member_leave_adjustments SET days = GREATEST(1, ROUND(days)) WHERE days <> ROUND(days);

    ALTER TABLE member_leave_allowances DROP CONSTRAINT IF EXISTS member_leave_allowances_base_days_whole;
    ALTER TABLE member_leave_allowances ADD CONSTRAINT member_leave_allowances_base_days_whole
      CHECK (base_days = TRUNC(base_days));

    ALTER TABLE member_leave_adjustments DROP CONSTRAINT IF EXISTS member_leave_adjustments_days_whole;
    ALTER TABLE member_leave_adjustments ADD CONSTRAINT member_leave_adjustments_days_whole
      CHECK (days = TRUNC(days));

    ALTER TABLE member_leave_adjustments
      ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
  `);
};

exports.down = pgm => {
  pgm.sql(`
    ALTER TABLE member_leave_adjustments DROP COLUMN IF EXISTS updated_at;
    ALTER TABLE member_leave_adjustments DROP COLUMN IF EXISTS updated_by;
    ALTER TABLE member_leave_adjustments DROP CONSTRAINT IF EXISTS member_leave_adjustments_days_whole;
    ALTER TABLE member_leave_allowances DROP CONSTRAINT IF EXISTS member_leave_allowances_base_days_whole;
  `);
};
