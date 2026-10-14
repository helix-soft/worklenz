import dayjs, { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import {
  ITimeLogEntry,
  ITimeLogsBucket,
  ITimeLogsFlatGroup,
  ITimeLogsGroupNode,
  TimeLogsBucketGranularity,
  TimeLogsGroupBy,
} from '@/types/reporting/time-logs-report.types';

dayjs.extend(isoWeek);

export type TimeLogsDatePreset =
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear';

export type TimeLogsDateRange = [Dayjs, Dayjs];

/**
 * Categorical palette for groups without their own color (members, clients, tasks...).
 * Chosen to stay readable on both light and dark backgrounds.
 */
export const TIME_LOGS_CHART_PALETTE = [
  '#1890ff',
  '#52c41a',
  '#fa8c16',
  '#eb2f96',
  '#13c2c2',
  '#722ed1',
  '#fadb14',
  '#f5222d',
  '#2f54eb',
  '#a0d911',
];

export const TIME_LOGS_OTHER_COLOR = '#8c8c8c';

/** Formats seconds as `H:MM` (e.g. 32040 → `8:54`), like Clockify's summary report. */
export const formatDurationClock = (totalSeconds: number): string => {
  const safeSeconds = Math.max(0, Math.round(totalSeconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, '0')}`;
};

/** Formats seconds as decimal hours (e.g. 32040 → `8.90`). */
export const formatDurationDecimal = (totalSeconds: number): string =>
  (Math.max(0, totalSeconds || 0) / 3600).toFixed(2);

export const flattenTimeLogGroups = (groups: ITimeLogsFlatGroup[]): ITimeLogEntry[] =>
  groups.flatMap(group =>
    (group.logs || []).map(log => ({
      id: log.id,
      date: dayjs(group.log_day).format('YYYY-MM-DD'),
      userId: log.user_id,
      userName: log.user_name || '',
      userAvatarUrl: log.user_avatar_url,
      projectId: log.project_id,
      projectName: log.project_name || '',
      projectColor: log.project_color,
      clientId: log.client_id,
      clientName: log.client_name,
      taskId: log.task_id,
      taskName: log.task_name || '',
      billable: Boolean(log.billable),
      seconds: Number(log.time_spent) || 0,
      description: (log.description || '').trim(),
    }))
  );

export const getTotalSeconds = (entries: ITimeLogEntry[]): number =>
  entries.reduce((sum, entry) => sum + entry.seconds, 0);

export const getPresetRange = (
  preset: TimeLogsDatePreset,
  today: Dayjs = dayjs()
): TimeLogsDateRange => {
  const day = today.startOf('day');
  switch (preset) {
    case 'today':
      return [day, day];
    case 'yesterday':
      return [day.subtract(1, 'day'), day.subtract(1, 'day')];
    case 'thisWeek':
      return [day.startOf('isoWeek'), day.endOf('isoWeek').startOf('day')];
    case 'lastWeek': {
      const lastWeek = day.subtract(1, 'week');
      return [lastWeek.startOf('isoWeek'), lastWeek.endOf('isoWeek').startOf('day')];
    }
    case 'thisMonth':
      return [day.startOf('month'), day.endOf('month').startOf('day')];
    case 'lastMonth': {
      const lastMonth = day.subtract(1, 'month');
      return [lastMonth.startOf('month'), lastMonth.endOf('month').startOf('day')];
    }
    case 'thisYear':
      return [day.startOf('year'), day.endOf('year').startOf('day')];
  }
};

/**
 * Moves a range one period back or forward. Whole calendar months and years move by
 * month/year, everything else (including ISO weeks) moves by its length in days.
 */
export const shiftDateRange = (range: TimeLogsDateRange, direction: 1 | -1): TimeLogsDateRange => {
  const [start, end] = range;
  const isWholeYear =
    start.isSame(start.startOf('year'), 'day') && end.isSame(start.endOf('year'), 'day');
  if (isWholeYear) {
    const nextStart = start.add(direction, 'year');
    return [nextStart, nextStart.endOf('year').startOf('day')];
  }

  const isWholeMonths =
    start.isSame(start.startOf('month'), 'day') && end.isSame(end.endOf('month'), 'day');
  if (isWholeMonths) {
    const months = end.diff(start, 'month') + 1;
    const nextStart = start.add(direction * months, 'month');
    return [
      nextStart,
      nextStart
        .add(months - 1, 'month')
        .endOf('month')
        .startOf('day'),
    ];
  }

  const days = end.diff(start, 'day') + 1;
  return [start.add(direction * days, 'day'), end.add(direction * days, 'day')];
};

/** Detects which preset (if any) a range corresponds to. */
export const findMatchingPreset = (
  range: TimeLogsDateRange,
  today: Dayjs = dayjs()
): TimeLogsDatePreset | null => {
  const presets: TimeLogsDatePreset[] = [
    'today',
    'yesterday',
    'thisWeek',
    'lastWeek',
    'thisMonth',
    'lastMonth',
    'thisYear',
  ];
  return (
    presets.find(preset => {
      const [start, end] = getPresetRange(preset, today);
      return start.isSame(range[0], 'day') && end.isSame(range[1], 'day');
    }) ?? null
  );
};

export const getBucketGranularity = (range: TimeLogsDateRange): TimeLogsBucketGranularity => {
  const days = range[1].diff(range[0], 'day') + 1;
  if (days <= 31) return 'day';
  if (days <= 26 * 7) return 'week';
  return 'month';
};

const getBucketStart = (date: Dayjs, granularity: TimeLogsBucketGranularity): Dayjs => {
  if (granularity === 'week') return date.startOf('isoWeek');
  if (granularity === 'month') return date.startOf('month');
  return date.startOf('day');
};

/**
 * Splits the range into day/week/month buckets (including empty ones) and sums the
 * logged time per bucket and per primary group.
 */
export const buildTimeBuckets = (
  entries: ITimeLogEntry[],
  range: TimeLogsDateRange,
  groupBy: TimeLogsGroupBy
): ITimeLogsBucket[] => {
  const granularity = getBucketGranularity(range);
  const buckets = new Map<string, ITimeLogsBucket>();

  let cursor = getBucketStart(range[0], granularity);
  const last = range[1].startOf('day');
  while (!cursor.isAfter(last, 'day')) {
    const key = cursor.format('YYYY-MM-DD');
    buckets.set(key, { key, start: key, granularity, seconds: 0, byGroup: {} });
    cursor = cursor.add(1, granularity);
  }

  for (const entry of entries) {
    const key = getBucketStart(dayjs(entry.date), granularity).format('YYYY-MM-DD');
    const bucket = buckets.get(key);
    if (!bucket) continue;
    const groupKey = getGroupKey(entry, groupBy);
    bucket.seconds += entry.seconds;
    bucket.byGroup[groupKey] = (bucket.byGroup[groupKey] || 0) + entry.seconds;
  }

  return Array.from(buckets.values());
};

export const getGroupKey = (entry: ITimeLogEntry, dimension: TimeLogsGroupBy): string => {
  switch (dimension) {
    case 'project':
      return entry.projectId;
    case 'client':
      return entry.clientId || '';
    case 'member':
      return entry.userId;
    case 'task':
      return entry.taskId;
    case 'date':
      return entry.date;
    case 'description':
      return entry.description.toLowerCase();
  }
};

const getGroupLabel = (entry: ITimeLogEntry, dimension: TimeLogsGroupBy): string => {
  switch (dimension) {
    case 'project':
      return entry.projectName;
    case 'client':
      return entry.clientName || '';
    case 'member':
      return entry.userName;
    case 'task':
      return entry.taskName;
    case 'date':
      return entry.date;
    case 'description':
      return entry.description;
  }
};

const getGroupSubLabel = (entry: ITimeLogEntry, dimension: TimeLogsGroupBy): string | undefined => {
  if (dimension === 'project') return entry.clientName || undefined;
  if (dimension === 'task') return entry.projectName;
  return undefined;
};

/**
 * Assigns a stable color to every group key: projects keep their own color, other
 * dimensions get palette colors in order of logged time.
 */
export const getGroupColors = (
  entries: ITimeLogEntry[],
  dimension: TimeLogsGroupBy
): Record<string, string> => {
  const totals = new Map<string, { seconds: number; color: string | null }>();
  for (const entry of entries) {
    const key = getGroupKey(entry, dimension);
    const current = totals.get(key) || {
      seconds: 0,
      color: dimension === 'project' ? entry.projectColor : null,
    };
    current.seconds += entry.seconds;
    totals.set(key, current);
  }

  const colors: Record<string, string> = {};
  Array.from(totals.entries())
    .sort((a, b) => b[1].seconds - a[1].seconds)
    .forEach(([key, value], index) => {
      colors[key] = value.color || TIME_LOGS_CHART_PALETTE[index % TIME_LOGS_CHART_PALETTE.length];
    });
  return colors;
};

const sortNodes = (nodes: ITimeLogsGroupNode[]): ITimeLogsGroupNode[] =>
  nodes.sort((a, b) =>
    a.dimension === 'date' ? b.groupKey.localeCompare(a.groupKey) : b.seconds - a.seconds
  );

const buildLevel = (
  entries: ITimeLogEntry[],
  dimension: TimeLogsGroupBy,
  total: number,
  colors: Record<string, string>,
  parentKey: string
): ITimeLogsGroupNode[] => {
  const nodes = new Map<string, ITimeLogsGroupNode>();
  for (const entry of entries) {
    const groupKey = getGroupKey(entry, dimension);
    const node = nodes.get(groupKey) || {
      key: `${parentKey}/${dimension}:${groupKey}`,
      groupKey,
      dimension,
      label: getGroupLabel(entry, dimension),
      subLabel: getGroupSubLabel(entry, dimension),
      color: colors[groupKey] || TIME_LOGS_OTHER_COLOR,
      seconds: 0,
      percent: 0,
      entryCount: 0,
    };
    node.seconds += entry.seconds;
    node.entryCount += 1;
    nodes.set(groupKey, node);
  }

  return sortNodes(
    Array.from(nodes.values()).map(node => ({
      ...node,
      percent: total > 0 ? (node.seconds / total) * 100 : 0,
    }))
  );
};

/**
 * Builds the two-level summary tree (e.g. Project → Description). Percentages are relative
 * to the overall total so rows can be compared across groups.
 */
export const groupTimeLogs = (
  entries: ITimeLogEntry[],
  primary: TimeLogsGroupBy,
  secondary: TimeLogsGroupBy | null
): ITimeLogsGroupNode[] => {
  const total = getTotalSeconds(entries);
  const primaryColors = getGroupColors(entries, primary);
  const roots = buildLevel(entries, primary, total, primaryColors, 'root');

  if (!secondary || secondary === primary) return roots;

  const secondaryColors = getGroupColors(entries, secondary);
  return roots.map(root => {
    const children = entries.filter(entry => getGroupKey(entry, primary) === root.groupKey);
    return {
      ...root,
      children: buildLevel(children, secondary, total, secondaryColors, root.key),
    };
  });
};
