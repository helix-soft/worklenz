import { cloneElement, ReactElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { DownOutlined, Dropdown } from '@/shared/antd-imports';
import { IGoogleCalendarEvent } from '@/types/google-calendar.types';

/**
 * Opens a synced event in the calendar app chosen on this device: Google Calendar (web),
 * Notion Calendar (desktop deep link) or the system's default calendar app (.ics file).
 * A web page cannot see which calendar app is the device default, so the choice is made once
 * via the arrow menu and remembered in this browser.
 */
export const OpenInCalendarButton = ({ event }: OpenInCalendarButtonProps) => {
  const { t } = useTranslation('home');
  const [app, setApp] = useState<CalendarApp>(readStoredApp);

  const labels: Record<CalendarApp, string> = {
    google: t('homeCalendar.google.openInGoogle', { defaultValue: 'Open in Google Calendar' }),
    notion: t('homeCalendar.google.openInNotion', { defaultValue: 'Open in Notion Calendar' }),
    system: t('homeCalendar.google.downloadIcs', {
      defaultValue: 'Download as calendar file (.ics)',
    }),
  };
  const available = CALENDAR_APPS.filter(candidate => isAvailable(candidate, event));
  if (!available.length) return null;
  const current = available.includes(app) ? app : available[0];

  const open = (target: CalendarApp) => {
    if (target === 'google' && event.html_link) {
      window.open(event.html_link, '_blank', 'noopener,noreferrer');
    } else if (target === 'notion') {
      const link = buildNotionCalendarLink(event);
      if (link) window.location.href = link;
    } else if (target === 'system') {
      downloadIcs(event);
    }
  };

  const choose = (target: CalendarApp) => {
    setApp(target);
    try {
      localStorage.setItem(STORAGE_KEY, target);
    } catch {
      // Storage unavailable (private mode): the choice lasts until the modal closes.
    }
    open(target);
  };

  return (
    <Dropdown.Button
      type="primary"
      icon={<DownOutlined />}
      onClick={() => open(current)}
      menu={{
        items: available.map(candidate => ({ key: candidate, label: labels[candidate] })),
        selectedKeys: [current],
        onClick: ({ key }) => choose(key as CalendarApp),
      }}
      buttonsRender={([left, right]) => [
        left,
        cloneElement(right as ReactElement<{ 'aria-label'?: string }>, {
          'aria-label': t('homeCalendar.google.chooseCalendarApp', {
            defaultValue: 'Choose calendar app',
          }),
        }),
      ]}
    >
      {labels[current]}
    </Dropdown.Button>
  );
};

const isAvailable = (app: CalendarApp, event: IGoogleCalendarEvent) => {
  if (app === 'google') return Boolean(event.html_link);
  if (app === 'notion') return Boolean(buildNotionCalendarLink(event));
  return Boolean(event.start_at || event.start_date);
};

const readStoredApp = (): CalendarApp => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (CALENDAR_APPS as readonly string[]).includes(stored)) return stored as CalendarApp;
  } catch {
    // Fall through to the default.
  }
  return 'google';
};

/**
 * Notion Calendar desktop deep link (cron://showEvent), documented at
 * https://www.notion.com/help/notion-calendar-connections. All-day end dates are exclusive there,
 * while ours are stored inclusive. Null when the event has no iCalUID yet (not re-synced).
 */
const buildNotionCalendarLink = (event: IGoogleCalendarEvent) => {
  if (!event.ical_uid || !event.account_email) return null;
  const { start, end } = getIsoRange(event);
  if (!start || !end) return null;
  const params: Record<string, string> = {
    accountEmail: event.account_email,
    iCalUID: event.ical_uid,
    startDate: start,
    endDate: end,
    title: event.title || '',
    ref: 'worklenz',
  };
  // encodeURIComponent (not URLSearchParams) so spaces become %20 rather than "+".
  const query = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return `cron://showEvent?${query}`;
};

/** ISO start/end; all-day events as dates with an exclusive end. */
const getIsoRange = (event: IGoogleCalendarEvent) =>
  event.is_all_day
    ? {
        start: event.start_date,
        end: event.start_date
          ? dayjs(event.end_date || event.start_date)
              .add(1, 'day')
              .format('YYYY-MM-DD')
          : null,
      }
    : {
        start: event.start_at ? dayjs(event.start_at).toISOString() : null,
        end: event.start_at ? dayjs(event.end_at || event.start_at).toISOString() : null,
      };

/**
 * Downloads the event as an .ics file; the operating system opens it in its default calendar app.
 * The Google iCalUID is kept as UID so apps that already sync this account can match the event.
 */
const downloadIcs = (event: IGoogleCalendarEvent) => {
  const { start, end } = getIsoRange(event);
  if (!start || !end) return;
  const dateValue = (iso: string) =>
    event.is_all_day
      ? `;VALUE=DATE:${iso.replace(/-/g, '')}`
      : `:${dayjs(iso)
          .toISOString()
          .replace(/[-:]/g, '')
          .replace(/\.\d{3}/, '')}`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Worklenz//Calendar//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(event.ical_uid || `${event.id}@worklenz`)}`,
    `DTSTAMP:${dayjs()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '')}`,
    `DTSTART${dateValue(start)}`,
    `DTEND${dateValue(end)}`,
    `SUMMARY:${escapeIcsText(event.title || '')}`,
    event.location ? `LOCATION:${escapeIcsText(event.location)}` : null,
    event.description
      ? `DESCRIPTION:${escapeIcsText(event.description.replace(/<[^>]+>/g, ' '))}`
      : null,
    event.html_link ? `URL:${event.html_link}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((line): line is string => line !== null);

  const blob = new Blob([lines.map(foldIcsLine).join('\r\n')], {
    type: 'text/calendar;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${(event.title || 'event').replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'event'}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const escapeIcsText = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/[,;]/g, match => `\\${match}`);

/** RFC 5545 line folding at 75 characters. */
const foldIcsLine = (line: string) => {
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(line.slice(i, i + 74));
  return parts.join('\r\n ');
};

const STORAGE_KEY = 'worklenz.calendarApp';
const CALENDAR_APPS = ['google', 'notion', 'system'] as const;

type CalendarApp = (typeof CALENDAR_APPS)[number];

interface OpenInCalendarButtonProps {
  event: IGoogleCalendarEvent;
}
