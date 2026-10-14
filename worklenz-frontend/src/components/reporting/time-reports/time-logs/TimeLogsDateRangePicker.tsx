import React, { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Dayjs } from 'dayjs';
import {
  Button,
  DatePicker,
  Space,
  Tooltip,
  LeftOutlined,
  RightOutlined,
} from '@/shared/antd-imports';
import { useResponsive } from '@/hooks/useResponsive';
import {
  getPresetRange,
  shiftDateRange,
  TimeLogsDatePreset,
  TimeLogsDateRange,
} from '@/utils/time-logs-report';

interface TimeLogsDateRangePickerProps {
  value: TimeLogsDateRange;
  onChange: (range: TimeLogsDateRange) => void;
}

/** Date range selector with presets and previous/next period navigation. */
export const TimeLogsDateRangePicker: React.FC<TimeLogsDateRangePickerProps> = memo(
  ({ value, onChange }) => {
    const { t } = useTranslation('time-report');
    // The page header sizes its actions to their content, so phones get a narrower picker.
    const { isMobile: isPhone } = useResponsive();

    const presets = useMemo(
      () =>
        PRESETS.map(preset => ({
          label: t(`timeLogsReport.presets.${preset.key}`, { defaultValue: preset.defaultValue }),
          value: getPresetRange(preset.key) as [Dayjs, Dayjs],
        })),
      [t]
    );

    const previousLabel = t('timeLogsReport.previousPeriod', { defaultValue: 'Previous period' });
    const nextLabel = t('timeLogsReport.nextPeriod', { defaultValue: 'Next period' });

    return (
      <Space.Compact>
        <Tooltip title={previousLabel}>
          <Button
            icon={<LeftOutlined />}
            aria-label={previousLabel}
            onClick={() => onChange(shiftDateRange(value, -1))}
          />
        </Tooltip>
        <DatePicker.RangePicker
          value={value}
          allowClear={false}
          presets={presets}
          format={isPhone ? 'MMM D' : 'MMM D, YYYY'}
          style={{ width: isPhone ? PHONE_PICKER_WIDTH : 260 }}
          aria-label={t('timeLogsReport.dateRange', { defaultValue: 'Date range' })}
          onChange={dates => {
            if (dates?.[0] && dates?.[1]) {
              onChange([dates[0].startOf('day'), dates[1].startOf('day')]);
            }
          }}
        />
        <Tooltip title={nextLabel}>
          <Button
            icon={<RightOutlined />}
            aria-label={nextLabel}
            onClick={() => onChange(shiftDateRange(value, 1))}
          />
        </Tooltip>
      </Space.Compact>
    );
  }
);

TimeLogsDateRangePicker.displayName = 'TimeLogsDateRangePicker';

const PRESETS: { key: TimeLogsDatePreset; defaultValue: string }[] = [
  { key: 'today', defaultValue: 'Today' },
  { key: 'yesterday', defaultValue: 'Yesterday' },
  { key: 'thisWeek', defaultValue: 'This week' },
  { key: 'lastWeek', defaultValue: 'Last week' },
  { key: 'thisMonth', defaultValue: 'This month' },
  { key: 'lastMonth', defaultValue: 'Last month' },
  { key: 'thisYear', defaultValue: 'This year' },
];

const PHONE_PICKER_WIDTH = 'calc(100vw - 200px)';
