export interface IGoogleCalendarStatus {
  /** The server has Google OAuth credentials configured. */
  configured: boolean;
  connected: boolean;
  google_email: string | null;
  status: 'active' | 'needs_reauth' | null;
  last_synced_at: string | null;
  last_sync_error: string | null;
  calendars_count: number;
}

export interface IGoogleCalendarAttendee {
  email: string | null;
  name: string | null;
  response: string | null;
  organizer: boolean;
}

export interface IGoogleCalendarEvent {
  id: string;
  title: string | null;
  description: string | null;
  location: string | null;
  is_all_day: boolean;
  /** Timed events: ISO instants. */
  start_at: string | null;
  end_at: string | null;
  /** All-day events: inclusive dates ("YYYY-MM-DD"). */
  start_date: string | null;
  end_date: string | null;
  html_link: string | null;
  hangout_link: string | null;
  organizer_email: string | null;
  attendees: IGoogleCalendarAttendee[];
  calendar_id: string;
  calendar_name: string | null;
  calendar_is_primary: boolean;
}
