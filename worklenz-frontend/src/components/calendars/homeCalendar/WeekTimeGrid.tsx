import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs, { Dayjs } from 'dayjs';
import { Tooltip, theme } from '@/shared/antd-imports';
import { TimeOffEntry } from '@/api/schedule/scheduleApi';
import { IHomeCalendarTask } from '@/types/home/home-page.types';
import { ICalendarHoliday } from '@/types/leave/leave.types';
import { IGoogleCalendarEvent } from '@/types/google-calendar.types';
import { assignLanes, ILaneSegment, MINUTES_PER_DAY } from '@/utils/week-calendar';
import { formatEventTimeRange, getCalendarColor } from './useGoogleCalendarEvents';

/**
 * Week view as an hour grid (like Google / MUI calendars): an all-day band per day with holidays,
 * time off, all-day events and the tasks due that day, and timed Google events placed by time.
 * Read-only: clicking an empty slot does nothing.
 */
export const WeekTimeGrid = ({
  days,
  eventsByDate,
  tasksByDate,
  timeOffByDate,
  holidaysByDate,
  onOpenEvent,
  onOpenTask,
  onOpenTimeOff,
}: WeekTimeGridProps) => {
  const { t } = useTranslation('home');
  const { token } = theme.useToken();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => dayjs());

  useEffect(() => {
    const interval = setInterval(() => setNow(dayjs()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Timed events per day, split at midnight and laid out side by side when they overlap.
  const segmentsByDay = useMemo(
    () =>
      days.map(day => {
        const dayStart = day.startOf('day');
        const dayEnd = dayStart.add(1, 'day');
        const seen = new Set<string>();
        const segments: IEventSegment[] = [];
        (eventsByDate.get(day.format('YYYY-MM-DD')) || []).forEach(event => {
          if (event.is_all_day || seen.has(event.id)) return;
          seen.add(event.id);
          const start = dayjs(event.start_at);
          const end = dayjs(event.end_at || event.start_at);
          const from = start.isAfter(dayStart) ? start : dayStart;
          const to = end.isBefore(dayEnd) ? end : dayEnd;
          const startMinute = from.diff(dayStart, 'minute');
          const endMinute = Math.max(to.diff(dayStart, 'minute'), startMinute + MIN_EVENT_MINUTES);
          segments.push({
            event,
            startMinute,
            endMinute: Math.min(endMinute, MINUTES_PER_DAY),
            lane: 0,
            laneCount: 1,
            isOverlapping: false,
          });
        });
        assignLanes(segments);
        return segments;
      }),
    [days, eventsByDate]
  );

  // Open at the earliest event of the week (or 8:00), once per week.
  const weekKey = days[0]?.format('YYYY-MM-DD');
  useEffect(() => {
    const earliest = Math.min(
      DEFAULT_SCROLL_HOUR * 60,
      ...segmentsByDay.flatMap(segments => segments.map(s => s.startMinute))
    );
    if (scrollRef.current)
      scrollRef.current.scrollTop = Math.max(0, (earliest / 60 - 0.5) * HOUR_HEIGHT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekKey, segmentsByDay.some(s => s.length > 0)]);

  const columnBackground = (day: Dayjs) => {
    if (holidaysByDate.has(day.format('YYYY-MM-DD'))) return token.colorErrorBg;
    if (day.day() === 0 || day.day() === 6) return token.colorFillQuaternary;
    return undefined;
  };

  const gridTemplate = `${GUTTER_WIDTH}px repeat(${days.length}, minmax(${MIN_DAY_WIDTH}px, 1fr))`;

  return (
    <div
      className="home-calendar-time-grid"
      style={{
        border: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgContainer,
      }}
    >
      <div ref={scrollRef} className="home-calendar-time-grid-scroll">
        {/* Sticky head: day names + all-day band */}
        <div
          className="home-calendar-time-grid-head"
          style={{
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: gridTemplate }}>
            <div />
            {days.map(day => {
              const isToday = day.isSame(now, 'day');
              return (
                <div
                  key={day.valueOf()}
                  className="home-calendar-time-grid-day-name"
                  style={{
                    borderLeft: `1px solid ${token.colorBorderSecondary}`,
                    background: columnBackground(day),
                    color: isToday
                      ? token.colorPrimary
                      : day.day() % 6 === 0
                        ? token.colorTextSecondary
                        : undefined,
                  }}
                >
                  <span>{day.format('ddd')}</span>{' '}
                  <span
                    className={isToday ? 'home-calendar-time-grid-today' : undefined}
                    style={
                      isToday
                        ? { background: token.colorPrimary, color: token.colorWhite }
                        : undefined
                    }
                  >
                    {day.format('M/D')}
                  </span>
                </div>
              );
            })}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: gridTemplate,
              borderTop: `1px solid ${token.colorBorderSecondary}`,
            }}
          >
            <div
              className="home-calendar-time-grid-gutter-label"
              style={{ color: token.colorTextTertiary }}
            >
              {t('homeCalendar.week.allDay', { defaultValue: 'all-day' })}
            </div>
            {days.map(day => (
              <AllDayCell
                key={day.valueOf()}
                day={day}
                background={columnBackground(day)}
                holidays={holidaysByDate.get(day.format('YYYY-MM-DD')) || []}
                timeOff={timeOffByDate.get(day.format('YYYY-MM-DD')) || []}
                events={(eventsByDate.get(day.format('YYYY-MM-DD')) || []).filter(
                  e => e.is_all_day
                )}
                tasks={tasksByDate.get(day.format('YYYY-MM-DD')) || []}
                onOpenEvent={onOpenEvent}
                onOpenTask={onOpenTask}
                onOpenTimeOff={onOpenTimeOff}
              />
            ))}
          </div>
        </div>

        {/* Hour grid */}
        <div
          style={{ display: 'grid', gridTemplateColumns: gridTemplate, height: HOUR_HEIGHT * 24 }}
        >
          <div style={{ position: 'relative' }}>
            {Array.from({ length: 24 }, (_, hour) =>
              hour === 0 ? null : (
                <span
                  key={hour}
                  className="home-calendar-time-grid-hour"
                  style={{ top: hour * HOUR_HEIGHT, color: token.colorTextTertiary }}
                >
                  {`${String(hour).padStart(2, '0')}:00`}
                </span>
              )
            )}
          </div>
          {days.map((day, dayIndex) => {
            const isToday = day.isSame(now, 'day');
            return (
              <div
                key={day.valueOf()}
                style={{
                  position: 'relative',
                  borderLeft: `1px solid ${token.colorBorderSecondary}`,
                  backgroundColor: columnBackground(day),
                  backgroundImage: `repeating-linear-gradient(to bottom, ${token.colorBorderSecondary} 0, ${token.colorBorderSecondary} 1px, transparent 1px, transparent ${HOUR_HEIGHT}px)`,
                }}
              >
                {segmentsByDay[dayIndex].map(segment => (
                  <EventBlock key={segment.event.id} segment={segment} now={now} onOpenEvent={onOpenEvent} />
                ))}
                {isToday && (
                  <div
                    aria-hidden
                    className="home-calendar-time-grid-now"
                    style={{
                      top: (now.diff(day.startOf('day'), 'minute') / 60) * HOUR_HEIGHT,
                      borderTopColor: token.colorError,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const AllDayCell = ({
  day,
  background,
  holidays,
  timeOff,
  events,
  tasks,
  onOpenEvent,
  onOpenTask,
  onOpenTimeOff,
}: {
  day: Dayjs;
  background?: string;
  holidays: ICalendarHoliday[];
  timeOff: TimeOffEntry[];
  events: IGoogleCalendarEvent[];
  tasks: IHomeCalendarTask[];
  onOpenEvent: (event: IGoogleCalendarEvent) => void;
  onOpenTask: (task: IHomeCalendarTask) => void;
  onOpenTimeOff?: (entry: TimeOffEntry) => void;
}) => {
  const { t } = useTranslation('home');
  const { token } = theme.useToken();
  const seen = new Set<string>();

  return (
    <div
      className="home-calendar-time-grid-all-day"
      style={{ borderLeft: `1px solid ${token.colorBorderSecondary}`, background }}
      aria-label={day.format('dddd, MMMM D')}
    >
      {holidays.map(holiday => (
        <Chip
          key={`h-${holiday.name}`}
          color={token.colorError}
          label={holiday.name}
          title={holiday.name}
        />
      ))}
      {timeOff.map(entry => {
        const label = entry.type
          ? `${t('timeOff.timeOff', { defaultValue: 'Time Off' })} (${t(`timeOff.types.${entry.type}`, { defaultValue: entry.type })})`
          : t('timeOff.timeOff', { defaultValue: 'Time Off' });
        return (
          <Chip
            key={`o-${entry.id}`}
            color={token.colorWarning}
            label={label}
            title={entry.reason ? `${label}: ${entry.reason}` : label}
            onClick={onOpenTimeOff ? () => onOpenTimeOff(entry) : undefined}
          />
        );
      })}
      {events.map(event => {
        if (seen.has(event.id)) return null;
        seen.add(event.id);
        const title =
          event.title || t('homeCalendar.google.untitled', { defaultValue: '(No title)' });
        return (
          <Chip
            key={`g-${event.id}`}
            color={getCalendarColor(event)}
            label={title}
            title={`${title}${event.calendar_name ? ` · ${event.calendar_name}` : ''}`}
            onClick={() => onOpenEvent(event)}
          />
        );
      })}
      {tasks.map(task => (
        <Chip
          key={`t-${task.id}`}
          color={task.project_color || token.colorPrimary}
          variant="task"
          isDone={task.is_completed}
          label={task.name}
          title={`${t('homeCalendar.agenda.due', { defaultValue: 'Due' })}: ${task.name}${task.project_name ? ` · ${task.project_name}` : ''}`}
          onClick={() => onOpenTask(task)}
        />
      ))}
    </div>
  );
};

const Chip = ({
  color,
  label,
  title,
  onClick,
  variant = 'filled',
  isDone = false,
}: {
  color: string;
  label: string;
  title: string;
  onClick?: () => void;
  variant?: 'filled' | 'task';
  isDone?: boolean;
}) => {
  const { token } = theme.useToken();
  const style: React.CSSProperties =
    variant === 'task'
      ? {
          borderLeft: `3px solid ${color}`,
          background: token.colorFillTertiary,
          color: token.colorText,
        }
      : {
          background: `color-mix(in srgb, ${color} 20%, ${token.colorBgContainer})`,
          borderLeft: `3px solid ${color}`,
          color: token.colorText,
        };
  return (
    <Tooltip title={title}>
      <button
        type="button"
        className="home-calendar-time-grid-chip"
        style={{
          ...style,
          textDecoration: isDone ? 'line-through' : undefined,
          cursor: onClick ? 'pointer' : 'default',
        }}
        onClick={e => {
          e.stopPropagation();
          onClick?.();
        }}
      >
        {label}
      </button>
    </Tooltip>
  );
};

const EventBlock = ({
  segment,
  now,
  onOpenEvent,
}: {
  segment: IEventSegment;
  now: Dayjs;
  onOpenEvent: (event: IGoogleCalendarEvent) => void;
}) => {
  const { t } = useTranslation('home');
  const { token } = theme.useToken();
  const { event, startMinute, endMinute, lane, laneCount } = segment;
  // Events that have already ended are greyed out so what's still ahead stands out.
  const isPast = !dayjs(event.end_at || event.start_at).isAfter(now);
  const color = getCalendarColor(event);
  const height = ((endMinute - startMinute) / 60) * HOUR_HEIGHT;
  const title = event.title || t('homeCalendar.google.untitled', { defaultValue: '(No title)' });
  const time = formatEventTimeRange(event);

  return (
    <Tooltip title={`${time} · ${title}`}>
      <button
        type="button"
        className={`home-calendar-time-grid-event ${height < 36 ? 'home-calendar-time-grid-event-compact' : ''}`}
        onClick={() => onOpenEvent(event)}
        style={{
          top: (startMinute / 60) * HOUR_HEIGHT + 1,
          height: Math.max(height - 2, 18),
          left: `calc(${(lane / laneCount) * 100}% + 2px)`,
          width: `calc(${100 / laneCount}% - 4px)`,
          background: isPast
            ? token.colorFillSecondary
            : `color-mix(in srgb, ${color} 22%, ${token.colorBgContainer})`,
          border: isPast
            ? `1px solid ${token.colorBorder}`
            : `1px solid color-mix(in srgb, ${color} 55%, ${token.colorBgContainer})`,
          color: isPast ? token.colorTextTertiary : token.colorText,
        }}
      >
        <span
          className="home-calendar-time-grid-event-time"
          style={{ color: isPast ? token.colorTextTertiary : color }}
        >
          {time}
        </span>
        <span className="home-calendar-time-grid-event-title">{title}</span>
      </button>
    </Tooltip>
  );
};

interface IEventSegment extends ILaneSegment {
  event: IGoogleCalendarEvent;
}

interface WeekTimeGridProps {
  days: Dayjs[];
  eventsByDate: Map<string, IGoogleCalendarEvent[]>;
  tasksByDate: Map<string, IHomeCalendarTask[]>;
  timeOffByDate: Map<string, TimeOffEntry[]>;
  holidaysByDate: Map<string, ICalendarHoliday[]>;
  onOpenEvent: (event: IGoogleCalendarEvent) => void;
  onOpenTask: (task: IHomeCalendarTask) => void;
  onOpenTimeOff?: (entry: TimeOffEntry) => void;
}

const HOUR_HEIGHT = 48;
const GUTTER_WIDTH = 56;
const MIN_DAY_WIDTH = 110;
const MIN_EVENT_MINUTES = 20;
const DEFAULT_SCROLL_HOUR = 8;
