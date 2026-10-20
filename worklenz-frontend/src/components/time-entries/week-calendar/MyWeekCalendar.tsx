import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs, { Dayjs } from 'dayjs';
import {
  Button,
  Flex,
  Result,
  Spin,
  Tooltip,
  Typography,
  theme,
  LeftOutlined,
  RightOutlined,
  WarningOutlined,
} from '@/shared/antd-imports';
import {
  buildWeekCalendar,
  getWeekStart,
  IWeekCalendarDay,
  IWeekCalendarEntry,
  IWeekCalendarSegment,
} from '@/utils/week-calendar';
import { formatDurationClock } from '@/utils/time-logs-report';
import {
  getTimeLogActivityDefaultLabel,
  getTimeLogActivityKey,
} from '@/shared/time-log-activities';
import { useHolidayNames } from '@/hooks/useHolidayNames';

interface MyWeekCalendarProps {
  weekStart: Dayjs;
  onWeekStartChange: (weekStart: Dayjs) => void;
  entries: IWeekCalendarEntry[];
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void;
  onOpenEntry: (entry: IWeekCalendarEntry) => void;
}

/**
 * Clockify-style week calendar of the user's own time logs: daily totals in the header and
 * each log drawn as a block on an hour grid. Logs that overlap are allowed (parallel work)
 * and are shown side by side with a warning outline, plus the overlapping time per day.
 */
export const MyWeekCalendar: React.FC<MyWeekCalendarProps> = memo(
  ({ weekStart, onWeekStartChange, entries, isLoading, hasError, onRetry, onOpenEntry }) => {
    const { t } = useTranslation('home');
    const { token } = theme.useToken();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [now, setNow] = useState(() => dayjs());

    const days = useMemo(() => buildWeekCalendar(entries, weekStart), [entries, weekStart]);
    // Official and company holidays of the week; their columns are tinted like in the Planner.
    const holidayNames = useHolidayNames(weekStart, weekStart.add(6, 'day'));
    const weekTotal = days.reduce((sum, day) => sum + day.totalSeconds, 0);
    const weekOverlap = days.reduce((sum, day) => sum + day.overlapSeconds, 0);
    const isCurrentWeek = getWeekStart(now).isSame(weekStart, 'day');

    // Keep the "now" line moving
    useEffect(() => {
      const interval = setInterval(() => setNow(dayjs()), 60_000);
      return () => clearInterval(interval);
    }, []);

    // Scroll to the start of the working day, or earlier if something was logged before it
    useEffect(() => {
      const earliest = Math.min(
        DEFAULT_SCROLL_HOUR * 60,
        ...days.flatMap(day => day.segments.map(segment => segment.startMinute))
      );
      if (scrollRef.current) {
        scrollRef.current.scrollTop = Math.max(0, (earliest / 60 - 0.5) * HOUR_HEIGHT);
      }
      // Only when the week changes, so refreshes don't jump the scroll position
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [weekStart.valueOf(), entries.length > 0]);

    const rangeLabel = `${weekStart.format('MMM D')} – ${weekStart.add(6, 'day').format('MMM D, YYYY')}`;
    const previousLabel = t('logTime.week.previous', { defaultValue: 'Previous week' });
    const nextLabel = t('logTime.week.next', { defaultValue: 'Next week' });

    return (
      <Flex vertical style={{ flex: 1, minHeight: 0 }}>
        <Flex align="center" justify="space-between" wrap gap={8} style={{ marginBottom: 12 }}>
          <Flex align="center" gap={8} wrap>
            <Tooltip title={previousLabel}>
              <Button
                size="small"
                icon={<LeftOutlined />}
                aria-label={previousLabel}
                onClick={() => onWeekStartChange(weekStart.subtract(1, 'week'))}
              />
            </Tooltip>
            <Button
              size="small"
              disabled={isCurrentWeek}
              onClick={() => onWeekStartChange(getWeekStart())}
            >
              {t('logTime.week.thisWeek', { defaultValue: 'This week' })}
            </Button>
            <Tooltip title={nextLabel}>
              <Button
                size="small"
                icon={<RightOutlined />}
                aria-label={nextLabel}
                onClick={() => onWeekStartChange(weekStart.add(1, 'week'))}
              />
            </Tooltip>
            <Typography.Text strong style={{ fontSize: 13 }}>
              {rangeLabel}
            </Typography.Text>
            {isLoading && <Spin size="small" />}
          </Flex>
          <Flex align="center" gap={12}>
            {weekOverlap > 0 && (
              <Tooltip
                title={t('logTime.week.overlapHint', {
                  defaultValue:
                    'Time logged in parallel. Allowed, but check that it was intentional.',
                })}
              >
                <Typography.Text style={{ fontSize: 12, color: token.colorWarningText }}>
                  <WarningOutlined />{' '}
                  {t('logTime.week.overlap', {
                    defaultValue: 'Overlap: {{duration}}',
                    duration: formatDurationClock(weekOverlap),
                  })}
                </Typography.Text>
              </Tooltip>
            )}
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {t('logTime.week.total', { defaultValue: 'Week total' })}:{' '}
              <Typography.Text strong style={{ fontSize: 14 }}>
                {formatDurationClock(weekTotal)}
              </Typography.Text>
            </Typography.Text>
          </Flex>
        </Flex>

        {hasError ? (
          <Result
            status="error"
            title={t('logTime.week.errorTitle', { defaultValue: "Couldn't load this week's logs" })}
            extra={
              <Button type="primary" onClick={onRetry}>
                {t('logTime.week.retry', { defaultValue: 'Try again' })}
              </Button>
            }
          />
        ) : (
          <div
            style={{
              flex: 1,
              minHeight: MIN_BODY_HEIGHT,
              display: 'flex',
              flexDirection: 'column',
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: token.borderRadiusLG,
              overflowX: 'auto',
              overflowY: 'hidden',
            }}
          >
            <div
              style={{
                minWidth: MIN_GRID_WIDTH,
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
              }}
            >
              {/* The header lives inside the scroll area (sticky) so the vertical scrollbar
                  narrows header and rows equally and their columns stay aligned. */}
              <div
                ref={scrollRef}
                style={{ flex: 1, minHeight: 0, overflowY: 'auto', position: 'relative' }}
              >
                <DayHeaderRow days={days} now={now} holidayNames={holidayNames} />
                <div style={{ display: 'flex', height: HOUR_HEIGHT * 24, position: 'relative' }}>
                  <HourGutter />
                  {days.map(day => (
                    <DayColumn
                      key={day.date.valueOf()}
                      day={day}
                      now={now}
                      holidayName={holidayNames.get(day.date.format('YYYY-MM-DD'))}
                      onOpenEntry={onOpenEntry}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        {!hasError && !isLoading && entries.length === 0 && (
          <Typography.Text
            type="secondary"
            style={{ fontSize: 12, marginTop: 8, textAlign: 'center' }}
          >
            {t('logTime.week.empty', {
              defaultValue: 'Nothing logged this week yet. Use Quick Time Entry to add time.',
            })}
          </Typography.Text>
        )}
      </Flex>
    );
  }
);

MyWeekCalendar.displayName = 'MyWeekCalendar';

const DayHeaderRow: React.FC<{
  days: IWeekCalendarDay[];
  now: Dayjs;
  holidayNames: Map<string, string>;
}> = ({ days, now, holidayNames }) => {
  const { t } = useTranslation('home');
  const { token } = theme.useToken();

  return (
    <div
      style={{
        display: 'flex',
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        position: 'sticky',
        top: 0,
        zIndex: 3,
        background: token.colorBgContainer,
      }}
    >
      <div style={{ width: GUTTER_WIDTH, flexShrink: 0 }} />
      {days.map(day => {
        const isToday = day.date.isSame(now, 'day');
        const holidayName = holidayNames.get(day.date.format('YYYY-MM-DD'));
        return (
          <div
            key={day.date.valueOf()}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '6px 8px',
              borderLeft: `1px solid ${token.colorBorderSecondary}`,
              background: isToday ? token.colorPrimaryBg : dayColumnBg(day.date, holidayName, token),
            }}
          >
            <Typography.Text
              type={isToday ? undefined : 'secondary'}
              style={{
                fontSize: 11,
                display: 'block',
                color: isToday ? token.colorPrimary : undefined,
              }}
            >
              {day.date.format('ddd, MMM D')}
            </Typography.Text>
            {holidayName && (
              <Tooltip title={holidayName}>
                <Typography.Text
                  ellipsis
                  style={{ fontSize: 11, display: 'block', color: token.colorError, fontWeight: 600 }}
                >
                  {holidayName}
                </Typography.Text>
              </Tooltip>
            )}
            <Flex align="center" gap={6}>
              <Typography.Text
                strong
                style={{ fontSize: 15, fontVariantNumeric: 'tabular-nums' }}
                type={day.totalSeconds > 0 ? undefined : 'secondary'}
              >
                {formatDurationClock(day.totalSeconds)}
              </Typography.Text>
              {day.overlapSeconds > 0 && (
                <Tooltip
                  title={t('logTime.week.dayOverlap', {
                    defaultValue: '{{duration}} logged in parallel on this day',
                    duration: formatDurationClock(day.overlapSeconds),
                  })}
                >
                  <WarningOutlined
                    style={{ color: token.colorWarning, fontSize: 12 }}
                    aria-label={t('logTime.week.dayOverlap', {
                      defaultValue: '{{duration}} logged in parallel on this day',
                      duration: formatDurationClock(day.overlapSeconds),
                    })}
                  />
                </Tooltip>
              )}
            </Flex>
          </div>
        );
      })}
    </div>
  );
};

const HourGutter: React.FC = () => {
  const { token } = theme.useToken();
  return (
    <div style={{ width: GUTTER_WIDTH, flexShrink: 0, position: 'relative' }}>
      {Array.from({ length: 24 }, (_, hour) => (
        <div
          key={hour}
          style={{
            position: 'absolute',
            top: hour * HOUR_HEIGHT,
            right: 6,
            transform: 'translateY(-50%)',
            fontSize: 10,
            color: token.colorTextTertiary,
            display: hour === 0 ? 'none' : undefined,
          }}
        >
          {`${String(hour).padStart(2, '0')}:00`}
        </div>
      ))}
    </div>
  );
};

const DayColumn: React.FC<{
  day: IWeekCalendarDay;
  now: Dayjs;
  holidayName?: string;
  onOpenEntry: (entry: IWeekCalendarEntry) => void;
}> = ({ day, now, holidayName, onOpenEntry }) => {
  const { token } = theme.useToken();
  const isToday = day.date.isSame(now, 'day');
  const nowMinute = now.diff(day.date, 'minute');

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        position: 'relative',
        borderLeft: `1px solid ${token.colorBorderSecondary}`,
        backgroundColor: dayColumnBg(day.date, holidayName, token),
        backgroundImage: `repeating-linear-gradient(to bottom, ${token.colorBorderSecondary} 0, ${token.colorBorderSecondary} 1px, transparent 1px, transparent ${HOUR_HEIGHT}px)`,
      }}
    >
      {day.segments.map(segment => (
        <EntryBlock key={segment.key} segment={segment} onOpenEntry={onOpenEntry} />
      ))}
      {isToday && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: (nowMinute / 60) * HOUR_HEIGHT,
            borderTop: `2px solid ${token.colorError}`,
            zIndex: 2,
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
};

const EntryBlock: React.FC<{
  segment: IWeekCalendarSegment;
  onOpenEntry: (entry: IWeekCalendarEntry) => void;
}> = ({ segment, onOpenEntry }) => {
  const { t } = useTranslation('home');
  const { token } = theme.useToken();
  const { entry } = segment;
  const color = entry.projectColor || token.colorPrimary;
  const top = (segment.startMinute / 60) * HOUR_HEIGHT;
  const height = Math.max(
    MIN_BLOCK_HEIGHT,
    ((segment.endMinute - segment.startMinute) / 60) * HOUR_HEIGHT - 2
  );
  const widthPercent = 100 / segment.laneCount;
  const end = entry.start.add(entry.seconds, 'second');
  const timeRange = `${entry.start.format('HH:mm')} – ${end.format('HH:mm')}`;
  const duration = formatDurationClock(entry.seconds);
  const label = `${entry.taskName}, ${entry.projectName}, ${timeRange} (${duration})`;

  return (
    <Tooltip
      title={
        <div>
          <div style={{ fontWeight: 600 }}>{entry.taskName}</div>
          <div style={{ opacity: 0.8 }}>{entry.projectName}</div>
          <div>
            {timeRange} ({duration})
          </div>
          {entry.activity && (
            <div>
              {t(getTimeLogActivityKey(entry.activity), {
                defaultValue: getTimeLogActivityDefaultLabel(entry.activity),
              })}
            </div>
          )}
          {entry.description && <div style={{ marginTop: 4 }}>{entry.description}</div>}
          {segment.isOverlapping && (
            <div style={{ marginTop: 4 }}>
              <WarningOutlined />{' '}
              {t('logTime.week.blockOverlap', { defaultValue: 'Overlaps another log' })}
            </div>
          )}
        </div>
      }
    >
      <button
        type="button"
        aria-label={label}
        onClick={() => onOpenEntry(entry)}
        style={{
          position: 'absolute',
          top: top + 1,
          height,
          left: `calc(${segment.lane * widthPercent}% + 2px)`,
          width: `calc(${widthPercent}% - 4px)`,
          padding: '2px 4px 2px 6px',
          border: segment.isOverlapping
            ? `1px dashed ${token.colorWarning}`
            : `1px solid ${token.colorBorderSecondary}`,
          borderLeft: `3px solid ${color}`,
          borderRadius: 4,
          background: `color-mix(in srgb, ${color} 18%, ${token.colorBgContainer})`,
          color: token.colorText,
          textAlign: 'left',
          overflow: 'hidden',
          cursor: 'pointer',
          zIndex: 1,
          fontSize: 11,
          lineHeight: 1.3,
        }}
      >
        <div
          style={{
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {entry.taskName}
        </div>
        {height >= 34 && (
          <div
            style={{
              color: token.colorTextSecondary,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {timeRange}
          </div>
        )}
      </button>
    </Tooltip>
  );
};

// Static content
const HOUR_HEIGHT = 44;
const GUTTER_WIDTH = 48;
const MIN_BLOCK_HEIGHT = 16;
const MIN_BODY_HEIGHT = 360;
const MIN_GRID_WIDTH = 640;
const DEFAULT_SCROLL_HOUR = 8;

/** Same tints as the Planner: holidays red, weekends grey. */
const dayColumnBg = (
  date: Dayjs,
  holidayName: string | undefined,
  token: ReturnType<typeof theme.useToken>['token']
) => {
  if (holidayName) return token.colorErrorBg;
  if (date.day() === 0 || date.day() === 6) return token.colorFillQuaternary;
  return undefined;
};
