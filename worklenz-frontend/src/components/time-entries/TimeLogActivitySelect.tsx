import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Select } from '@/shared/antd-imports';
import {
  getTimeLogActivityKey,
  TIME_LOG_ACTIVITIES,
  TimeLogActivity,
} from '@/shared/time-log-activities';

interface TimeLogActivitySelectProps {
  value?: TimeLogActivity | null;
  onChange?: (value: TimeLogActivity) => void;
  id?: string;
  size?: 'small' | 'middle' | 'large';
  disabled?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

/** Activity picker shared by every time log form; works standalone or inside Form.Item. */
export const TimeLogActivitySelect: React.FC<TimeLogActivitySelectProps> = ({
  value,
  onChange,
  ...rest
}) => {
  // Option labels live in one namespace so every form shows the same wording
  const { t, i18n } = useTranslation('home');

  const options = useMemo(
    () =>
      TIME_LOG_ACTIVITIES.map(item => ({
        value: item.value,
        label: t(getTimeLogActivityKey(item.value), { defaultValue: item.defaultLabel }),
      }))
        // Alphabetical in the user's language, so the order holds after translation
        .sort((a, b) => a.label.localeCompare(b.label, i18n.language)),
    [t, i18n.language]
  );

  return (
    <Select<TimeLogActivity>
      {...rest}
      style={{ width: '100%' }}
      showSearch
      optionFilterProp="label"
      value={value ?? undefined}
      onChange={onChange}
      options={options}
    />
  );
};
