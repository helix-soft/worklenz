import { describe, expect, it } from 'vitest';
import dayjs from 'dayjs';
import { buildWeekCalendar, getWeekStart, IWeekCalendarEntry } from './week-calendar';

const weekStart = getWeekStart(dayjs('2026-10-14T12:00:00'));

const entry = (id: string, start: string, minutes: number): IWeekCalendarEntry => ({
  id,
  taskId: `task-${id}`,
  taskName: `Task ${id}`,
  projectId: 'p1',
  projectName: 'Project',
  projectColor: '#3b7ad4',
  description: '',
  activity: null,
  start: dayjs(start),
  seconds: minutes * 60,
});

describe('buildWeekCalendar', () => {
  it('starts the week on Monday and places logs on their day', () => {
    const days = buildWeekCalendar([entry('a', '2026-10-14T09:00:00', 90)], weekStart);

    expect(days.map(d => d.date.format('YYYY-MM-DD'))).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
    expect(days[2].segments).toHaveLength(1);
    expect(days[2].segments[0]).toMatchObject({ startMinute: 540, endMinute: 630 });
    expect(days[2].totalSeconds).toBe(90 * 60);
  });

  it('puts overlapping logs side by side and reports the overlapping time', () => {
    const [monday] = buildWeekCalendar(
      [
        entry('a', '2026-10-12T09:00:00', 120), // 09:00–11:00
        entry('b', '2026-10-12T10:00:00', 60), // 10:00–11:00 (overlaps a)
        entry('c', '2026-10-12T11:00:00', 30), // 11:00–11:30 (touches, no overlap)
      ],
      weekStart
    );

    const byId = Object.fromEntries(monday.segments.map(s => [s.entry.id, s]));
    expect(byId.a).toMatchObject({ lane: 0, laneCount: 2, isOverlapping: true });
    expect(byId.b).toMatchObject({ lane: 1, laneCount: 2, isOverlapping: true });
    expect(byId.c).toMatchObject({ lane: 0, laneCount: 1, isOverlapping: false });
    expect(monday.totalSeconds).toBe(210 * 60);
    expect(monday.overlapSeconds).toBe(60 * 60);
  });

  it('reuses freed lanes within one cluster', () => {
    const [monday] = buildWeekCalendar(
      [
        entry('long', '2026-10-12T08:00:00', 240), // 08:00–12:00
        entry('first', '2026-10-12T08:30:00', 60), // 08:30–09:30
        entry('second', '2026-10-12T10:00:00', 60), // 10:00–11:00, reuses lane 1
      ],
      weekStart
    );

    const byId = Object.fromEntries(monday.segments.map(s => [s.entry.id, s]));
    expect(byId.first.lane).toBe(1);
    expect(byId.second.lane).toBe(1);
    expect(monday.segments.every(s => s.laneCount === 2)).toBe(true);
    expect(monday.overlapSeconds).toBe(120 * 60);
  });

  it('splits a log that runs past midnight across two days', () => {
    const days = buildWeekCalendar([entry('night', '2026-10-13T23:00:00', 120)], weekStart);

    expect(days[1].segments[0]).toMatchObject({ startMinute: 23 * 60, endMinute: 24 * 60 });
    expect(days[2].segments[0]).toMatchObject({ startMinute: 0, endMinute: 60 });
    expect(days[1].totalSeconds + days[2].totalSeconds).toBe(120 * 60);
  });

  it('ignores logs outside the week', () => {
    const days = buildWeekCalendar([entry('old', '2026-10-05T09:00:00', 60)], weekStart);
    expect(days.every(d => d.segments.length === 0)).toBe(true);
  });
});
