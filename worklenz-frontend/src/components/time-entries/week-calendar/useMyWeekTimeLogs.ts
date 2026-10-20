import { useCallback, useEffect, useRef, useState } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { IRecentTimeLog, taskTimeLogsApiService } from '@/api/tasks/task-time-logs.api.service';
import { IWeekCalendarEntry } from '@/utils/week-calendar';
import logger from '@/utils/errorLogger';

/**
 * Loads the current user's time logs for one ISO week. The endpoint filters by UTC date, so
 * one extra day is fetched on each side and the calendar buckets logs by local time.
 */
export const useMyWeekTimeLogs = (weekStart: Dayjs, refreshKey: number) => {
  const [entries, setEntries] = useState<IWeekCalendarEntry[]>([]);
  const [logs, setLogs] = useState<IRecentTimeLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const latestRequestId = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latestRequestId.current;
    setIsLoading(true);
    setHasError(false);
    try {
      const all = await fetchAllPages(weekStart);
      if (requestId !== latestRequestId.current) return;
      setLogs(all);
      setEntries(all.map(toCalendarEntry));
    } catch (error) {
      if (requestId !== latestRequestId.current) return;
      logger.error('Error fetching week time logs', error);
      setEntries([]);
      setLogs([]);
      setHasError(true);
    } finally {
      if (requestId === latestRequestId.current) setIsLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return { entries, logs, isLoading, hasError, reload: load };
};

// Helpers
const fetchAllPages = async (weekStart: Dayjs): Promise<IRecentTimeLog[]> => {
  const params = {
    date_filter: 'custom',
    date_from: weekStart.subtract(1, 'day').format('YYYY-MM-DD'),
    date_to: weekStart.add(7, 'day').format('YYYY-MM-DD'),
    sort_field: 'created_at',
    sort_order: 'asc' as const,
    page_size: PAGE_SIZE,
  };

  const logs: IRecentTimeLog[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await taskTimeLogsApiService.getMyTimeLogEntries({ ...params, page });
    if (!res.done) throw new Error(res.message || 'Failed to fetch time logs');
    const batch = res.body?.logs || [];
    logs.push(...batch);
    if (batch.length < PAGE_SIZE || logs.length >= (res.body?.total || 0)) break;
  }
  return logs;
};

const toCalendarEntry = (log: IRecentTimeLog): IWeekCalendarEntry => ({
  id: log.id,
  taskId: log.task_id,
  taskName: log.task_name || '',
  // Logs made from a calendar event (on the project's Meetings task) read better by the event title.
  title: (log.google_event_id && (log.description || '').trim()) || log.task_name || '',
  projectId: log.project_id,
  projectName: log.project_name || '',
  projectColor: log.project_color || null,
  description: (log.description || '').trim(),
  activity: log.activity || null,
  start: dayjs(log.created_at),
  seconds: Number(log.time_spent) || 0,
});

// Static content
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
