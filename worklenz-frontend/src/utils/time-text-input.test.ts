import { describe, expect, it } from 'vitest';
import dayjs from 'dayjs';
import {
  formatTime,
  getTimeRangeSeconds,
  isCompleteTimeText,
  isOvernightTimeRange,
  parseTimeText,
} from './time-text-input';

describe('parseTimeText', () => {
  it.each([
    ['1131', '11:31'],
    ['0905', '09:05'],
    ['931', '09:31'],
    ['9', '09:00'],
    ['09', '09:00'],
    ['23', '23:00'],
    ['11:31', '11:31'],
    ['9:5', '09:05'],
    ['11.31', '11:31'],
    ['11h31', '11:31'],
    ['11 31', '11:31'],
    ['7:', '07:00'],
    [' 1131 ', '11:31'],
    ['0000', '00:00'],
    ['2359', '23:59'],
  ])('parses %s as %s', (input, expected) => {
    const parsed = parseTimeText(input);
    expect(parsed && formatTime(parsed)).toBe(expected);
  });

  it.each(['', '2400', '1160', '24', '99', '12345', 'abc', '11:3a', '1:2:3'])(
    'rejects %s',
    input => {
      expect(parseTimeText(input)).toBeNull();
    }
  );
});

describe('isCompleteTimeText', () => {
  it('is complete only for four digits or HH:MM with two minute digits', () => {
    expect(isCompleteTimeText('1131')).toBe(true);
    expect(isCompleteTimeText('11:31')).toBe(true);
    expect(isCompleteTimeText('9:31')).toBe(true);
    expect(isCompleteTimeText('113')).toBe(false);
    expect(isCompleteTimeText('11:3')).toBe(false);
    expect(isCompleteTimeText('11')).toBe(false);
  });

  it('is not complete for invalid four-digit times', () => {
    expect(isCompleteTimeText('2460')).toBe(false);
    expect(isCompleteTimeText('1199')).toBe(false);
  });
});

describe('getTimeRangeSeconds', () => {
  it('uses clock times only, even when the dates differ', () => {
    const start = dayjs('2026-10-01T11:31:00');
    const end = dayjs('2026-10-14T12:45:00');
    expect(getTimeRangeSeconds(start, end)).toBe(74 * 60);
  });

  it('treats an end earlier than the start as the next day', () => {
    expect(getTimeRangeSeconds(dayjs('2026-10-14T23:00:00'), dayjs('2026-10-14T01:00:00'))).toBe(
      2 * 3600
    );
    expect(getTimeRangeSeconds(dayjs('2026-10-14T21:21:00'), dayjs('2026-10-14T00:58:00'))).toBe(
      (3 * 60 + 37) * 60
    );
    expect(isOvernightTimeRange(dayjs('2026-10-14T23:00:00'), dayjs('2026-10-14T01:00:00'))).toBe(
      true
    );
    expect(isOvernightTimeRange(dayjs('2026-10-14T09:00:00'), dayjs('2026-10-14T10:00:00'))).toBe(
      false
    );
  });

  it('returns 0 for missing values or identical times', () => {
    expect(getTimeRangeSeconds(null, dayjs())).toBe(0);
    expect(getTimeRangeSeconds(dayjs('2026-10-14T12:00:00'), dayjs('2026-10-14T12:00:00'))).toBe(0);
  });
});
