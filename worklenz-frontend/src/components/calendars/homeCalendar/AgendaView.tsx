import { useTranslation } from 'react-i18next';
import { Dayjs } from 'dayjs';
import { TimeOffEntry } from '@/api/schedule/scheduleApi';
import { IHomeCalendarTask } from '@/types/home/home-page.types';
import { ICalendarHoliday } from '@/types/leave/leave.types';
import { IGoogleCalendarEvent } from '@/types/google-calendar.types';
import { formatEventTimeRange } from './useGoogleCalendarEvents';

/**
 * Agenda: one block per day that has something on it (header row: weekday left, full date right),
 * listing holidays, time off, Google events (all-day first, then by time) and tasks due that day.
 */
export const AgendaView = ({
  days,
  eventsByDate,
  tasksByDate,
  timeOffByDate,
  holidaysByDate,
  onOpenEvent,
  onOpenTask,
  onOpenTimeOff,
}: AgendaViewProps) => {
  const { t } = useTranslation('home');

  const blocks = days
    .map(date => {
      const key = date.format('YYYY-MM-DD');
      const rows: AgendaRow[] = [
        ...(holidaysByDate.get(key) || []).map(holiday => ({
          key: `h-${holiday.name}`,
          time: t('homeCalendar.agenda.holiday', { defaultValue: 'Holiday' }),
          title: holiday.name,
          kind: 'holiday' as const,
        })),
        ...(timeOffByDate.get(key) || []).map(entry => ({
          key: `o-${entry.id}`,
          time: t('timeOff.timeOff', { defaultValue: 'Time Off' }),
          title: entry.type
            ? t(`timeOff.types.${entry.type}`, { defaultValue: entry.type })
            : entry.reason || '',
          kind: 'timeOff' as const,
          onClick: () => onOpenTimeOff?.(entry),
        })),
        ...(eventsByDate.get(key) || []).map(event => ({
          key: `g-${event.id}`,
          time: event.is_all_day
            ? t('homeCalendar.google.allDay', { defaultValue: 'All day' })
            : formatEventTimeRange(event),
          title: event.title || t('homeCalendar.google.untitled', { defaultValue: '(No title)' }),
          kind: 'event' as const,
          onClick: () => onOpenEvent(event),
        })),
        ...(tasksByDate.get(key) || []).map(task => ({
          key: `t-${task.id}`,
          time: t('homeCalendar.agenda.due', { defaultValue: 'Due' }),
          title: task.name,
          subtitle: task.project_name || undefined,
          kind: 'task' as const,
          color: task.project_color || undefined,
          onClick: () => onOpenTask(task),
        })),
      ];
      return { date, key, rows };
    })
    .filter(block => block.rows.length > 0);

  if (!blocks.length) {
    return (
      <div className="home-calendar-agenda home-calendar-agenda-empty">
        {t('homeCalendar.agenda.empty', { defaultValue: 'Nothing scheduled this week.' })}
      </div>
    );
  }

  return (
    <div className="home-calendar-agenda">
      {blocks.map(({ date, key, rows }) => (
        <section key={key} aria-label={date.format('dddd, MMMM D, YYYY')}>
          <div className="home-calendar-agenda-day">
            <span>{date.format('dddd')}</span>
            <span>{date.format('MMMM D, YYYY')}</span>
          </div>
          {rows.map(row => (
            <div
              key={row.key}
              className={`home-calendar-agenda-row ${row.onClick ? 'home-calendar-agenda-row-clickable' : ''}`}
              role={row.onClick ? 'button' : undefined}
              tabIndex={row.onClick ? 0 : undefined}
              onClick={row.onClick}
              onKeyDown={e => {
                if (row.onClick && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  row.onClick();
                }
              }}
            >
              <span className="home-calendar-agenda-time">{row.time}</span>
              <span
                className={`home-calendar-agenda-dot home-calendar-agenda-dot-${row.kind}`}
                style={row.color ? { background: row.color } : undefined}
              />
              <span className="home-calendar-agenda-title">
                {row.title}
                {row.subtitle && (
                  <span className="home-calendar-agenda-subtitle">{row.subtitle}</span>
                )}
              </span>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
};

interface AgendaRow {
  key: string;
  time: string;
  title: string;
  subtitle?: string;
  kind: 'holiday' | 'timeOff' | 'event' | 'task';
  color?: string;
  onClick?: () => void;
}

interface AgendaViewProps {
  days: Dayjs[];
  eventsByDate: Map<string, IGoogleCalendarEvent[]>;
  tasksByDate: Map<string, IHomeCalendarTask[]>;
  timeOffByDate: Map<string, TimeOffEntry[]>;
  holidaysByDate: Map<string, ICalendarHoliday[]>;
  onOpenEvent: (event: IGoogleCalendarEvent) => void;
  onOpenTask: (task: IHomeCalendarTask) => void;
  onOpenTimeOff?: (entry: TimeOffEntry) => void;
}
