import dayjs, { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(isoWeek);

/** A time log as an interval: it starts at `created_at` and lasts `time_spent` seconds. */
export interface IWeekCalendarEntry {
  id: string;
  taskId: string;
  taskName: string;
  projectId: string;
  projectName: string;
  projectColor: string | null;
  description: string;
  activity: string | null;
  start: Dayjs;
  seconds: number;
}

/** The part of an entry that falls on one calendar day, in minutes from that day's midnight. */
export interface IWeekCalendarSegment {
  key: string;
  entry: IWeekCalendarEntry;
  startMinute: number;
  endMinute: number;
  /** Column within its overlap cluster (0-based) and the cluster's column count. */
  lane: number;
  laneCount: number;
  /** True when this segment overlaps at least one other segment on the same day. */
  isOverlapping: boolean;
}

export interface IWeekCalendarDay {
  date: Dayjs;
  segments: IWeekCalendarSegment[];
  /** Sum of all logged seconds on this day (overlapping time counted for each log). */
  totalSeconds: number;
  /** Seconds during which two or more logs ran at the same time. */
  overlapSeconds: number;
}

export const MINUTES_PER_DAY = 24 * 60;

export const getWeekStart = (date: Dayjs = dayjs()): Dayjs => date.startOf('isoWeek');

/**
 * Lays out one ISO week (Mon–Sun): splits entries at midnight, assigns side-by-side lanes to
 * overlapping segments and computes per-day totals and overlap.
 */
export const buildWeekCalendar = (
  entries: IWeekCalendarEntry[],
  weekStart: Dayjs
): IWeekCalendarDay[] => {
  const start = weekStart.startOf('day');
  const days: IWeekCalendarDay[] = Array.from({ length: 7 }, (_, index) => ({
    date: start.add(index, 'day'),
    segments: [],
    totalSeconds: 0,
    overlapSeconds: 0,
  }));

  for (const entry of entries) {
    if (entry.seconds <= 0) continue;
    const entryEnd = entry.start.add(entry.seconds, 'second');

    days.forEach((day, dayIndex) => {
      const dayStart = day.date;
      const dayEnd = dayStart.add(1, 'day');
      if (!entry.start.isBefore(dayEnd) || !entryEnd.isAfter(dayStart)) return;

      const segmentStart = entry.start.isAfter(dayStart) ? entry.start : dayStart;
      const segmentEnd = entryEnd.isBefore(dayEnd) ? entryEnd : dayEnd;
      day.segments.push({
        key: `${entry.id}-${dayIndex}`,
        entry,
        startMinute: segmentStart.diff(dayStart, 'second') / 60,
        endMinute: segmentEnd.diff(dayStart, 'second') / 60,
        lane: 0,
        laneCount: 1,
        isOverlapping: false,
      });
      day.totalSeconds += segmentEnd.diff(segmentStart, 'second');
    });
  }

  for (const day of days) {
    assignLanes(day.segments);
    day.overlapSeconds = Math.round(getOverlapMinutes(day.segments) * 60);
  }

  return days;
};

/**
 * Assigns lanes so overlapping segments sit next to each other (like Clockify's calendar).
 * Segments are grouped into clusters of transitively overlapping intervals; each cluster
 * shares one lane count so widths line up.
 */
export const assignLanes = (segments: IWeekCalendarSegment[]): void => {
  segments.sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute);

  let cluster: IWeekCalendarSegment[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const closeCluster = () => {
    for (const segment of cluster) {
      segment.laneCount = laneEnds.length;
      segment.isOverlapping = laneEnds.length > 1 && overlapsAny(segment, cluster);
    }
    cluster = [];
    laneEnds = [];
  };

  for (const segment of segments) {
    if (segment.startMinute >= clusterEnd) {
      closeCluster();
      clusterEnd = -Infinity;
    }

    const freeLane = laneEnds.findIndex(end => end <= segment.startMinute);
    segment.lane = freeLane === -1 ? laneEnds.length : freeLane;
    laneEnds[segment.lane] = segment.endMinute;

    cluster.push(segment);
    clusterEnd = Math.max(clusterEnd, segment.endMinute);
  }
  closeCluster();
};

/** Total minutes during which at least two segments run at the same time (sweep line). */
export const getOverlapMinutes = (segments: IWeekCalendarSegment[]): number => {
  const events = segments.flatMap(segment => [
    { minute: segment.startMinute, delta: 1 },
    { minute: segment.endMinute, delta: -1 },
  ]);
  // Ends before starts at the same minute, so back-to-back logs don't count as overlap
  events.sort((a, b) => a.minute - b.minute || a.delta - b.delta);

  let active = 0;
  let overlap = 0;
  let previous = 0;
  for (const event of events) {
    if (active >= 2) overlap += event.minute - previous;
    active += event.delta;
    previous = event.minute;
  }
  return overlap;
};

const overlapsAny = (segment: IWeekCalendarSegment, others: IWeekCalendarSegment[]): boolean =>
  others.some(
    other =>
      other !== segment &&
      other.startMinute < segment.endMinute &&
      segment.startMinute < other.endMinute
  );
