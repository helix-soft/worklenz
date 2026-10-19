export type LeaveType = 'vacation' | 'sick';
export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type WorkLocation = 'office' | 'remote';

export interface ILeaveMember {
  team_member_id: string;
  user_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
}

export interface IMonthlyAttendance {
  work_days: number;
  worked_days: number;
  meal_vouchers: number;
  leave_days: number;
  office_days: number;
  remote_days: number;
  extra_worked_days: number;
}

export interface IAttendanceMemberRow extends ILeaveMember, IMonthlyAttendance {
  logged_hours: number;
  expected_hours: number;
}

export interface IAttendanceReport {
  year: number;
  month: number;
  start_date: string;
  end_date: string;
  work_days: number;
  members: IAttendanceMemberRow[];
}

export interface ILeaveBalance extends ILeaveMember {
  year: number;
  base_days: number | null;
  extra_days: number;
  total_days: number;
  used_days: number;
  pending_days: number;
  remaining_days: number;
  base_updated_at: string | null;
  base_updated_by_name: string | null;
}

export interface ILeaveAdjustment {
  id: string;
  days: number;
  note: string;
  created_at: string;
  created_by_name: string | null;
  updated_at: string | null;
  updated_by_name: string | null;
}

export interface ILeaveRequest {
  id: string;
  team_member_id: string;
  start_date: string;
  end_date: string;
  type: LeaveType;
  reason: string | null;
  status: LeaveRequestStatus;
  review_note: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  created_at: string;
  member_name: string;
  member_email: string;
  member_avatar: string | null;
}

export interface ICalendarHoliday {
  date: string;
  name: string;
  source: 'official' | 'custom';
}

export interface IMyLeaveOverview {
  balance: ILeaveBalance | null;
  requests: ILeaveRequest[];
  adjustments: ILeaveAdjustment[];
}

export interface ICreateLeaveRequest {
  start_date: string;
  end_date: string;
  type: LeaveType;
  reason?: string;
}

export interface ITodayWorkLocation {
  date: string;
  location?: WorkLocation | null;
  is_work_day?: boolean;
  is_on_leave?: boolean;
  should_ask: boolean;
}

export interface IMyWorkLocations {
  locations: { work_date: string; location: WorkLocation }[];
  summary: IMonthlyAttendance;
  work_day_dates: string[];
  non_work_dates: string[];
  leave_dates: string[];
}
