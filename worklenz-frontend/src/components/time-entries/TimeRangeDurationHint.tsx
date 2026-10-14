import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Dayjs } from 'dayjs';
import { Typography } from '@/shared/antd-imports';
import { getTimeRangeSeconds, isOvernightTimeRange } from '@/utils/time-text-input';
import { formatDurationClock } from '@/utils/time-logs-report';

interface TimeRangeDurationHintProps {
  start?: Dayjs | null;
  end?: Dayjs | null;
  style?: React.CSSProperties;
}

/**
 * Live duration under a start/end pair. An end before the start counts as the next day
 * (Clockify style); identical times are flagged since they log nothing.
 */
export const TimeRangeDurationHint: React.FC<TimeRangeDurationHintProps> = ({
  start,
  end,
  style,
}) => {
  const { t } = useTranslation('home');
  const seconds = getTimeRangeSeconds(start, end);
  const isSameTime = Boolean(start && end) && seconds === 0;

  return (
    <Typography.Text
      type={isSameTime ? 'danger' : 'secondary'}
      aria-live="polite"
      style={{ display: 'block', fontSize: 12, ...style }}
    >
      {isSameTime
        ? t('logTime.sameStartEnd', { defaultValue: 'Start and end time cannot be the same' })
        : t('logTime.rangeDuration', {
            defaultValue: 'Duration: {{duration}}',
            duration: formatDurationClock(seconds),
          })}
      {isOvernightTimeRange(start, end) &&
        ` ${t('logTime.rangeNextDay', { defaultValue: '(ends the next day)' })}`}
    </Typography.Text>
  );
};
