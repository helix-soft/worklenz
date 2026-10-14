/** Sentinel client id used to include projects without a client. Must match the backend. */
export const NO_CLIENT_FILTER_ID = '__no_client__';

export interface IBillableFilter {
  billable: boolean;
  nonBillable: boolean;
}

/** Request body for `POST /reporting/members/timelogs-flat`. */
export interface ITimeLogsFlatRequest {
  team_member_ids?: string[];
  project_ids?: string[];
  client_ids?: string[];
  date_range: string[];
  billable: IBillableFilter;
  search?: string;
}

/** A single log as returned by the flat time logs endpoint. */
export interface ITimeLogsFlatLog {
  id: string;
  created_at: string;
  user_id: string;
  user_name: string;
  user_avatar_url: string | null;
  team_member_id: string | null;
  project_id: string;
  project_name: string;
  project_color: string | null;
  client_id: string | null;
  client_name: string | null;
  task_id: string;
  task_name: string;
  billable: boolean | null;
  time_spent: number;
  time_spent_string: string;
  description: string | null;
}

export interface ITimeLogsFlatGroup {
  log_day: string;
  logs: ITimeLogsFlatLog[];
}

export interface ITimeLogsFilterProject {
  id: string;
  name: string;
  color_code: string | null;
  client_id: string | null;
  client_name: string | null;
}

export interface ITimeLogsFilterClient {
  id: string;
  name: string;
}

export interface ITimeLogsFilterMember {
  id: string;
  name: string;
  avatar_url: string | null;
}

export interface ITimeLogsFilterOptions {
  projects: ITimeLogsFilterProject[];
  clients: ITimeLogsFilterClient[];
  members: ITimeLogsFilterMember[];
}

/** A time log flattened for client-side aggregation. */
export interface ITimeLogEntry {
  id: string;
  /** Local log day, `YYYY-MM-DD`. */
  date: string;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  projectId: string;
  projectName: string;
  projectColor: string | null;
  clientId: string | null;
  clientName: string | null;
  taskId: string;
  taskName: string;
  billable: boolean;
  seconds: number;
  description: string;
}

export type TimeLogsGroupBy = 'project' | 'client' | 'member' | 'task' | 'date' | 'description';

export type TimeLogsBucketGranularity = 'day' | 'week' | 'month';

export interface ITimeLogsBucket {
  key: string;
  start: string;
  granularity: TimeLogsBucketGranularity;
  seconds: number;
  /** Seconds per primary group key. */
  byGroup: Record<string, number>;
}

export interface ITimeLogsGroupNode {
  key: string;
  groupKey: string;
  dimension: TimeLogsGroupBy;
  /** Raw label; empty when the value is missing (no client, no description). */
  label: string;
  /** Secondary label shown next to the main one, e.g. the client of a project. */
  subLabel?: string;
  color: string;
  seconds: number;
  percent: number;
  entryCount: number;
  children?: ITimeLogsGroupNode[];
}
