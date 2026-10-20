import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import dayjs, { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import Card from 'antd/es/card';
import { Button, Tooltip, Typography, SyncOutlined, theme } from '@/shared/antd-imports';
import { WorklenzLogoLoader } from '@/components/worklenz-loader/worklenz-loader';
import { useAuthService } from '@/hooks/useAuth';
import { useFetchTimeOffQuery, TimeOffEntry } from '@/api/schedule/scheduleApi';
import { leaveApiService } from '@/api/leave/leave.api.service';
import { ICalendarHoliday } from '@/types/leave/leave.types';
import { IGoogleCalendarEvent } from '@/types/google-calendar.types';
import {
  formatEventTimeRange,
  getCalendarColor,
  useGoogleCalendarEvents,
} from '@/components/calendars/homeCalendar/useGoogleCalendarEvents';
import { GoogleEventDetailsModal } from '@/components/calendars/homeCalendar/GoogleEventDetailsModal';
import { LeaveDetailsModal } from '@/components/leave/leave-details-modal';
import logger from '@/utils/errorLogger';
import type { HomePeriod } from '../HomeOverviewView';

dayjs.extend(isoWeek);

/**
 * Overview agenda: Google Calendar events, holidays and the user's time off for today or the
 * current (ISO) week. In "today" mode events that have already ended are hidden.
 */
export const HomeAgendaCard = ({ period }: HomeAgendaCardProps) => {
  const { t } = useTranslation('home');
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const currentSession = useAuthService().getCurrentSession();
  const now = useNow();

  const rangeStart = useMemo(
    () => (period === 'today' ? dayjs().startOf('day') : dayjs().startOf('isoWeek')),
    [period]
  );
  const rangeEnd = useMemo(
    () => (period === 'today' ? dayjs().endOf('day') : dayjs().endOf('isoWeek')),
    [period]
  );

  const { status, eventsByDate, isSyncing, isLoading, hasError, sync, reload } =
    useGoogleCalendarEvents(rangeStart, rangeEnd);

  const { data: timeOffData } = useFetchTimeOffQuery(
    {
      teamMemberId: currentSession?.team_member_id || '',
      startDate: rangeStart.format('YYYY-MM-DD'),
      endDate: rangeEnd.format('YYYY-MM-DD'),
    },
    { skip: !currentSession?.team_member_id, refetchOnMountOrArgChange: true }
  );
  const holidays = useHolidays(rangeStart, rangeEnd);

  const [selectedEvent, setSelectedEvent] = useState<IGoogleCalendarEvent | null>(null);
  const [selectedTimeOff, setSelectedTimeOff] = useState<TimeOffEntry | null>(null);

  const days = useMemo(() => {
    const count = rangeEnd.diff(rangeStart, 'day') + 1;
    return Array.from({ length: count }, (_, i) => rangeStart.add(i, 'day'));
  }, [rangeStart, rangeEnd]);

  const blocks = useMemo(
    () =>
      days
        .map(date => {
          const key = date.format('YYYY-MM-DD');
          const rows: AgendaRow[] = [
            ...holidays
              .filter(holiday => holiday.date === key)
              .map(holiday => ({
                key: `h-${holiday.name}`,
                time: t('homeAgenda.holiday', { defaultValue: 'Holiday' }),
                title: holiday.name,
                color: token.colorError,
              })),
            ...(timeOffData?.body || [])
              .filter(
                entry =>
                  dayjs(entry.start_date).format('YYYY-MM-DD') <= key &&
                  dayjs(entry.end_date).format('YYYY-MM-DD') >= key
              )
              .map(entry => ({
                key: `o-${entry.id}`,
                time: t('timeOff.timeOff', { defaultValue: 'Time Off' }),
                title: entry.type
                  ? t(`timeOff.types.${entry.type}`, { defaultValue: entry.type })
                  : entry.reason || '',
                color: token.colorWarning,
                onClick: () => setSelectedTimeOff(entry),
              })),
            ...(eventsByDate.get(key) || [])
              // Today: only what is still ahead or in progress.
              .filter(
                event => period !== 'today' || event.is_all_day || dayjs(event.end_at).isAfter(now)
              )
              .map(event => ({
                key: `g-${event.id}`,
                time: event.is_all_day
                  ? t('homeCalendar.google.allDay', { defaultValue: 'All day' })
                  : formatEventTimeRange(event),
                title:
                  event.title || t('homeCalendar.google.untitled', { defaultValue: '(No title)' }),
                color: getCalendarColor(event),
                isNow:
                  !event.is_all_day &&
                  !dayjs(event.start_at).isAfter(now) &&
                  dayjs(event.end_at).isAfter(now),
                onClick: () => setSelectedEvent(event),
              })),
          ];
          return { date, key, rows };
        })
        .filter(block => block.rows.length > 0),
    [days, holidays, timeOffData, eventsByDate, period, now, t, token]
  );

  const isConnected = Boolean(status?.connected);
  const needsReconnect = status?.status === 'needs_reauth';
  const goToIntegrations = () => navigate('/worklenz/settings/integrations');

  const renderBody = () => {
    if (isLoading) {
      return (
        <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
          <WorklenzLogoLoader />
        </div>
      );
    }
    if (hasError) {
      return (
        <EmptyState
          title={t('homeAgenda.error', { defaultValue: 'Could not load your calendar.' })}
          action={
            <Button size="small" onClick={() => void reload()}>
              {t('homeAgenda.retry', { defaultValue: 'Retry' })}
            </Button>
          }
        />
      );
    }
    if (!isConnected) {
      return (
        <EmptyState
          title={t('homeAgenda.notConnected', {
            defaultValue: 'Connect your Google Calendar to see your meetings here.',
          })}
          action={
            <Button type="link" size="small" onClick={goToIntegrations}>
              {t('homeCalendar.google.connect', { defaultValue: 'Connect Google Calendar' })}
            </Button>
          }
        />
      );
    }
    if (!blocks.length) {
      return (
        <EmptyState
          title={
            period === 'today'
              ? t('homeAgenda.emptyToday', { defaultValue: 'No more events today.' })
              : t('homeAgenda.emptyWeek', { defaultValue: 'No events this week.' })
          }
        />
      );
    }
    return (
      <div style={{ overflowY: 'auto', maxHeight: 320 }}>
        {blocks.map(({ date, key, rows }) => (
          <section key={key} aria-label={date.format('dddd, MMMM D, YYYY')}>
            {period === 'week' && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 16px',
                  fontSize: 12,
                  fontWeight: 600,
                  background: token.colorFillQuaternary,
                  color: date.isSame(now, 'day') ? token.colorPrimary : token.colorTextSecondary,
                }}
              >
                <span>{date.format('dddd')}</span>
                <span>{date.format('MMM D')}</span>
              </div>
            )}
            {rows.map(row => (
              <AgendaRowItem key={row.key} row={row} />
            ))}
          </section>
        ))}
      </div>
    );
  };

  return (
    <Card style={{ borderRadius: 10, overflow: 'hidden', flexShrink: 0 }} styles={{ body: { padding: 0 } }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '12px 16px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {period === 'today'
            ? t('homeAgenda.titleToday', { defaultValue: 'Agenda today' })
            : t('homeAgenda.titleWeek', { defaultValue: 'Agenda this week' })}
        </div>
        {isConnected && (
          <Tooltip
            title={
              needsReconnect
                ? t('homeCalendar.google.needsReconnect', {
                    defaultValue:
                      'Google Calendar needs to be reconnected in Settings → Integrations',
                  })
                : t('homeCalendar.google.sync', { defaultValue: 'Sync calendar' })
            }
          >
            <Button
              type="text"
              size="small"
              icon={<SyncOutlined />}
              loading={isSyncing}
              disabled={needsReconnect}
              aria-label={t('homeCalendar.google.sync', { defaultValue: 'Sync calendar' })}
              onClick={() => void sync()}
            />
          </Tooltip>
        )}
      </div>
      {renderBody()}

      <GoogleEventDetailsModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      <LeaveDetailsModal entry={selectedTimeOff} onClose={() => setSelectedTimeOff(null)} />
    </Card>
  );
};

const AgendaRowItem = ({ row }: { row: AgendaRow }) => {
  const { token } = theme.useToken();
  const [isHovered, setIsHovered] = useState(false);
  const isClickable = Boolean(row.onClick);

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={row.onClick}
      onKeyDown={e => {
        if (row.onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          row.onClick();
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 16px',
        cursor: isClickable ? 'pointer' : 'default',
        background: isClickable && isHovered ? token.colorFillTertiary : undefined,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        transition: 'background 150ms',
      }}
    >
      <span
        style={{
          flex: '0 0 92px',
          fontSize: 12,
          fontVariantNumeric: 'tabular-nums',
          color: row.isNow ? token.colorPrimary : token.colorTextSecondary,
          fontWeight: row.isNow ? 600 : undefined,
        }}
      >
        {row.time}
      </span>
      <span
        style={{
          flex: '0 0 8px',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: row.color,
        }}
      />
      <Typography.Text ellipsis={{ tooltip: row.title }} style={{ fontSize: 13, minWidth: 0 }}>
        {row.title}
      </Typography.Text>
    </div>
  );
};

const EmptyState = ({ title, action }: { title: string; action?: React.ReactNode }) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
      padding: '20px 16px',
      textAlign: 'center',
    }}
  >
    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
      {title}
    </Typography.Text>
    {action}
  </div>
);

/** Current time, refreshed every minute so finished events drop out of "today". */
const useNow = () => {
  const [now, setNow] = useState(() => dayjs());
  useEffect(() => {
    const id = window.setInterval(() => setNow(dayjs()), NOW_REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);
  return now;
};

/** Official and company holidays in [start, end]. */
const useHolidays = (start: Dayjs, end: Dayjs) => {
  const [holidays, setHolidays] = useState<ICalendarHoliday[]>([]);
  const startKey = start.format('YYYY-MM-DD');
  const endKey = end.format('YYYY-MM-DD');
  useEffect(() => {
    let isCancelled = false;
    leaveApiService
      .getHolidays(startKey, endKey)
      .then(res => {
        if (!isCancelled) setHolidays(res.done ? res.body : []);
      })
      .catch(error => logger.error('Error fetching holidays for agenda', error));
    return () => {
      isCancelled = true;
    };
  }, [startKey, endKey]);
  return holidays;
};

const NOW_REFRESH_MS = 60_000;

interface AgendaRow {
  key: string;
  time: string;
  title: string;
  color: string;
  isNow?: boolean;
  onClick?: () => void;
}

interface HomeAgendaCardProps {
  period: HomePeriod;
}
