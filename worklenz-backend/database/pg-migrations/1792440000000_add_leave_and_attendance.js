/* eslint-disable camelcase */

// Leave & attendance:
// - member_leave_allowances: yearly base leave days per member (set by Owner/Admin)
// - member_leave_adjustments: extra leave days granted on top of the base, always with a note
// - member_leave_requests: leave requests that become member_time_off rows once approved
// - member_work_locations: daily office/remote check-in per member
exports.up = pgm => {
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS member_leave_allowances (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
      year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
      base_days NUMERIC(5, 1) NOT NULL CHECK (base_days >= 0 AND base_days <= 366),
      updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT member_leave_allowances_member_year_unique UNIQUE (team_member_id, year)
    );

    CREATE TABLE IF NOT EXISTS member_leave_adjustments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
      year INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
      days NUMERIC(5, 1) NOT NULL CHECK (days > 0 AND days <= 366),
      note TEXT NOT NULL CHECK (char_length(trim(note)) BETWEEN 1 AND 500),
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_member_leave_adjustments_member_year
      ON member_leave_adjustments (team_member_id, year);

    CREATE TABLE IF NOT EXISTS member_leave_requests (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      type VARCHAR(20) NOT NULL CHECK (type IN ('vacation', 'personal', 'sick', 'other')),
      reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 500),
      status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
      time_off_id UUID REFERENCES member_time_off(id) ON DELETE SET NULL,
      requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
      reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      review_note TEXT CHECK (review_note IS NULL OR char_length(review_note) <= 500),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT member_leave_requests_date_range CHECK (end_date >= start_date)
    );
    CREATE INDEX IF NOT EXISTS idx_member_leave_requests_org_status
      ON member_leave_requests (organization_id, status);
    CREATE INDEX IF NOT EXISTS idx_member_leave_requests_member
      ON member_leave_requests (team_member_id, start_date);

    CREATE TABLE IF NOT EXISTS member_work_locations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
      work_date DATE NOT NULL,
      location VARCHAR(20) NOT NULL CHECK (location IN ('office', 'remote')),
      set_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT member_work_locations_member_date_unique UNIQUE (team_member_id, work_date)
    );
    CREATE INDEX IF NOT EXISTS idx_member_work_locations_org_date
      ON member_work_locations (organization_id, work_date);
  `);
};

exports.down = pgm => {
  pgm.sql(`
    DROP TABLE IF EXISTS member_work_locations;
    DROP TABLE IF EXISTS member_leave_requests;
    DROP TABLE IF EXISTS member_leave_adjustments;
    DROP TABLE IF EXISTS member_leave_allowances;
  `);
};
