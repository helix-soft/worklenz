import { describe, expect, it } from 'vitest';
import dayjs from 'dayjs';
import {
  buildTimeBuckets,
  findMatchingPreset,
  flattenTimeLogGroups,
  formatDurationClock,
  getBucketGranularity,
  getPresetRange,
  groupTimeLogs,
  shiftDateRange,
} from './time-logs-report';
import { ITimeLogEntry } from '@/types/reporting/time-logs-report.types';

const entry = (overrides: Partial<ITimeLogEntry>): ITimeLogEntry => ({
  id: 'log',
  date: '2026-10-12',
  userId: 'u1',
  userName: 'Anna',
  userAvatarUrl: null,
  projectId: 'p1',
  projectName: 'Website',
  projectColor: '#3b7ad4',
  clientId: 'c1',
  clientName: 'Acme',
  taskId: 't1',
  taskName: 'Design',
  billable: true,
  seconds: 3600,
  description: '',
  ...overrides,
});

const fmt = (range: [dayjs.Dayjs, dayjs.Dayjs]) => range.map(d => d.format('YYYY-MM-DD'));

describe('formatDurationClock', () => {
  it('formats seconds as H:MM', () => {
    expect(formatDurationClock(32040)).toBe('8:54');
    expect(formatDurationClock(0)).toBe('0:00');
    expect(formatDurationClock(59)).toBe('0:00');
    expect(formatDurationClock(36000 * 3)).toBe('30:00');
  });
});

describe('date ranges', () => {
  const wednesday = dayjs('2026-10-14');

  it('builds ISO (Monday-first) week presets', () => {
    expect(fmt(getPresetRange('thisWeek', wednesday))).toEqual(['2026-10-12', '2026-10-18']);
    expect(fmt(getPresetRange('lastWeek', wednesday))).toEqual(['2026-10-05', '2026-10-11']);
  });

  it('shifts weeks by seven days and months by calendar month', () => {
    expect(fmt(shiftDateRange(getPresetRange('thisWeek', wednesday), -1))).toEqual([
      '2026-10-05',
      '2026-10-11',
    ]);
    expect(fmt(shiftDateRange(getPresetRange('thisMonth', wednesday), 1))).toEqual([
      '2026-11-01',
      '2026-11-30',
    ]);
    expect(fmt(shiftDateRange(getPresetRange('thisYear', wednesday), -1))).toEqual([
      '2025-01-01',
      '2025-12-31',
    ]);
  });

  it('recognises the preset a range corresponds to', () => {
    expect(findMatchingPreset(getPresetRange('lastMonth', wednesday), wednesday)).toBe('lastMonth');
    expect(findMatchingPreset([dayjs('2026-10-01'), dayjs('2026-10-03')], wednesday)).toBeNull();
  });

  it('picks bucket granularity by range length', () => {
    expect(getBucketGranularity(getPresetRange('thisMonth', wednesday))).toBe('day');
    expect(getBucketGranularity([dayjs('2026-07-01'), dayjs('2026-10-14')])).toBe('week');
    expect(getBucketGranularity(getPresetRange('thisYear', wednesday))).toBe('month');
  });
});

describe('buildTimeBuckets', () => {
  it('creates a bucket per day including empty days and sums per group', () => {
    const range = getPresetRange('thisWeek', dayjs('2026-10-14'));
    const buckets = buildTimeBuckets(
      [
        entry({ date: '2026-10-12', seconds: 3600 }),
        entry({ date: '2026-10-12', projectId: 'p2', seconds: 1800 }),
        entry({ date: '2026-10-14', seconds: 7200 }),
        entry({ date: '2026-10-25', seconds: 999 }), // outside of the range
      ],
      range,
      'project'
    );

    expect(buckets).toHaveLength(7);
    expect(buckets[0]).toMatchObject({ key: '2026-10-12', seconds: 5400 });
    expect(buckets[0].byGroup).toEqual({ p1: 3600, p2: 1800 });
    expect(buckets[1].seconds).toBe(0);
    expect(buckets[2].seconds).toBe(7200);
  });
});

describe('groupTimeLogs', () => {
  const entries = [
    entry({ id: 'a', projectId: 'p1', description: 'Meeting', seconds: 3600 }),
    entry({ id: 'b', projectId: 'p1', description: 'meeting ', seconds: 1800 }),
    entry({ id: 'c', projectId: 'p2', projectName: 'App', projectColor: null, seconds: 5400 }),
  ];

  it('groups by primary dimension sorted by time with overall percentages', () => {
    const nodes = groupTimeLogs(entries, 'project', null);

    expect(nodes.map(n => [n.groupKey, n.seconds, Math.round(n.percent)])).toEqual([
      ['p1', 5400, 50],
      ['p2', 5400, 50],
    ]);
    expect(nodes[0].color).toBe('#3b7ad4');
    expect(nodes[0].subLabel).toBe('Acme');
    expect(nodes[0].children).toBeUndefined();
  });

  it('nests the secondary dimension and merges descriptions case-insensitively', () => {
    const [website] = groupTimeLogs(
      flattenTimeLogGroups([
        {
          log_day: '2026-10-12',
          logs: entries.slice(0, 2).map(e => ({
            id: e.id,
            created_at: '',
            user_id: e.userId,
            user_name: e.userName,
            user_avatar_url: null,
            team_member_id: null,
            project_id: e.projectId,
            project_name: e.projectName,
            project_color: e.projectColor,
            client_id: e.clientId,
            client_name: e.clientName,
            task_id: e.taskId,
            task_name: e.taskName,
            billable: e.billable,
            time_spent: e.seconds,
            time_spent_string: '',
            description: e.description,
          })),
        },
      ]),
      'project',
      'description'
    );

    expect(website.children).toHaveLength(1);
    expect(website.children?.[0]).toMatchObject({ label: 'Meeting', seconds: 5400, entryCount: 2 });
  });

  it('keeps logs without a client in their own group', () => {
    const nodes = groupTimeLogs(
      [entry({ clientId: null, clientName: null }), entry({ id: 'x' })],
      'client',
      null
    );
    expect(nodes.map(n => n.groupKey).sort()).toEqual(['', 'c1']);
  });
});
