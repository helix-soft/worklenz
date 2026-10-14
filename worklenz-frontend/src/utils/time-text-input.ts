import type { Dayjs } from 'dayjs';

export interface IParsedTime {
  hour: number;
  minute: number;
}

/**
 * Parses free-typed clock times the way Clockify does:
 * `1131` → 11:31, `931` → 09:31, `9` / `09` → 09:00, `11:31`, `11.31`, `11h31`, `11 31`.
 * Returns null for anything that isn't a valid 24-hour time.
 */
export const parseTimeText = (text: string): IParsedTime | null => {
  const value = text.trim().toLowerCase();
  if (!value) return null;

  let hourText: string;
  let minuteText: string;

  const separated = value.match(/^(\d{1,2})\s*[:.,h\s]\s*(\d{0,2})$/);
  if (separated) {
    hourText = separated[1];
    minuteText = separated[2] || '0';
  } else if (/^\d{1,4}$/.test(value)) {
    if (value.length <= 2) {
      hourText = value;
      minuteText = '0';
    } else {
      hourText = value.slice(0, value.length - 2);
      minuteText = value.slice(-2);
    }
  } else {
    return null;
  }

  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
};

/**
 * True when the typed text is a finished time that needs no more keystrokes:
 * four digits (`1131`) or `HH:MM` with two minute digits.
 */
export const isCompleteTimeText = (text: string): boolean => {
  const value = text.trim();
  const isFullForm = /^\d{4}$/.test(value) || /^\d{1,2}\s*[:.,h]\s*\d{2}$/i.test(value);
  return isFullForm && parseTimeText(value) !== null;
};

export const formatTime = ({ hour, minute }: IParsedTime): string =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

/**
 * Seconds between two clock times, ignoring their date parts (the inputs each keep their own
 * date). Like Clockify, an end earlier than the start means the next day (23:00–01:00 = 2h).
 * Returns 0 when either time is missing or both are the same.
 */
export const getTimeRangeSeconds = (start?: Dayjs | null, end?: Dayjs | null): number => {
  if (!start || !end) return 0;
  const minutes = end.hour() * 60 + end.minute() - (start.hour() * 60 + start.minute());
  if (minutes === 0) return 0;
  return (minutes > 0 ? minutes : minutes + MINUTES_PER_DAY) * 60;
};

/** True when the range runs past midnight (the end is earlier than the start). */
export const isOvernightTimeRange = (start?: Dayjs | null, end?: Dayjs | null): boolean => {
  if (!start || !end) return false;
  return end.hour() * 60 + end.minute() < start.hour() * 60 + start.minute();
};

const MINUTES_PER_DAY = 24 * 60;
