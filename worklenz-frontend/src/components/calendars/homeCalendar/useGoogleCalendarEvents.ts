import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { googleCalendarApiService } from '@/api/google-calendar/google-calendar.api.service';
import { IGoogleCalendarEvent, IGoogleCalendarStatus } from '@/types/google-calendar.types';
import logger from '@/utils/errorLogger';

const AUTO_SYNC_AFTER_MS = 5 * 60 * 1000;

/**
 * The current user's Google Calendar connection and its events in [start, end].
 * When the calendar opens and the last sync is older than five minutes, a sync runs in the
 * background and the events are reloaded afterwards.
 */
export const useGoogleCalendarEvents = (start: Dayjs, end: Dayjs) => {
  const [status, setStatus] = useState<IGoogleCalendarStatus | null>(null);
  const [events, setEvents] = useState<IGoogleCalendarEvent[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const hasAutoSynced = useRef(false);
  const startKey = start.format('YYYY-MM-DD');
  const endKey = end.format('YYYY-MM-DD');

  const loadEvents = useCallback(async () => {
    try {
      const res = await googleCalendarApiService.getEvents(startKey, endKey);
      if (res.done) setEvents(res.body);
      setHasError(!res.done);
    } catch (error) {
      logger.error('Error fetching Google Calendar events', error);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [startKey, endKey]);

  const sync = useCallback(async () => {
    setIsSyncing(true);
    try {
      const res = await googleCalendarApiService.sync();
      if (res.done) setStatus(res.body);
      await loadEvents();
    } catch (error) {
      logger.error('Error syncing Google Calendar', error);
    } finally {
      setIsSyncing(false);
    }
  }, [loadEvents]);

  const loadStatus = useCallback(async () => {
    try {
      const res = await googleCalendarApiService.getStatus();
      if (!res.done) {
        setHasError(true);
        setIsLoading(false);
        return;
      }
      setHasError(false);
      setStatus(res.body);
      if (!res.body.connected) setIsLoading(false);
      const lastSync = res.body.last_synced_at ? dayjs(res.body.last_synced_at).valueOf() : 0;
      if (
        res.body.connected &&
        res.body.status === 'active' &&
        !hasAutoSynced.current &&
        Date.now() - lastSync > AUTO_SYNC_AFTER_MS
      ) {
        hasAutoSynced.current = true;
        void sync();
      }
    } catch (error) {
      logger.error('Error fetching Google Calendar status', error);
      setHasError(true);
      setIsLoading(false);
    }
  }, [sync]);

  /** Retries after an error: status first, then (if connected) the events. */
  const reload = useCallback(async () => {
    setIsLoading(true);
    await loadStatus();
    await loadEvents();
  }, [loadStatus, loadEvents]);

  // Status once on mount, then a background sync if the data is stale.
  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status?.connected) void loadEvents();
    else setEvents([]);
  }, [status?.connected, loadEvents]);

  /** Events per local day ("YYYY-MM-DD"); multi-day events appear on every day they cover. */
  const eventsByDate = useMemo(() => {
    const map = new Map<string, IGoogleCalendarEvent[]>();
    const add = (key: string, event: IGoogleCalendarEvent) =>
      map.set(key, [...(map.get(key) || []), event]);
    events.forEach(event => {
      const { first, last } = getEventDays(event);
      for (let day = first; !day.isAfter(last, 'day'); day = day.add(1, 'day')) {
        add(day.format('YYYY-MM-DD'), event);
      }
    });
    map.forEach(list => list.sort(compareEvents));
    return map;
  }, [events]);

  return { status, eventsByDate, isSyncing, isLoading, hasError, sync, reload };
};

/** First and last local day an event covers (a timed event ending at midnight ends the day before). */
export const getEventDays = (event: IGoogleCalendarEvent) => {
  if (event.is_all_day) {
    return { first: dayjs(event.start_date), last: dayjs(event.end_date || event.start_date) };
  }
  const startAt = dayjs(event.start_at);
  const endAt = dayjs(event.end_at || event.start_at);
  const last = endAt.isAfter(startAt) ? endAt.subtract(1, 'minute') : startAt;
  return { first: startAt.startOf('day'), last: last.startOf('day') };
};

/** All-day first, then by start time. */
export const compareEvents = (a: IGoogleCalendarEvent, b: IGoogleCalendarEvent) => {
  if (a.is_all_day !== b.is_all_day) return a.is_all_day ? -1 : 1;
  return dayjs(a.start_at || a.start_date).valueOf() - dayjs(b.start_at || b.start_date).valueOf();
};

/** "09:50 – 11:50" (24-hour) */
export const formatEventTimeRange = (event: IGoogleCalendarEvent) =>
  `${dayjs(event.start_at).format('HH:mm')} – ${dayjs(event.end_at).format('HH:mm')}`;

const PRIMARY_CALENDAR_COLOR = '#722ed1';
const CALENDAR_PALETTE = ['#13c2c2', '#52c41a', '#fa8c16', '#eb2f96', '#2f54eb', '#a0d911', '#faad14'];

/** Stable color per Google calendar: the primary calendar is violet, others get a palette color. */
export const getCalendarColor = (event: Pick<IGoogleCalendarEvent, 'calendar_id' | 'calendar_is_primary'>) => {
  if (event.calendar_is_primary) return PRIMARY_CALENDAR_COLOR;
  let hash = 0;
  for (const char of event.calendar_id || '') hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return CALENDAR_PALETTE[hash % CALENDAR_PALETTE.length];
};
