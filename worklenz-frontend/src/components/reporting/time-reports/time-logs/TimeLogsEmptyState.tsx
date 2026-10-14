import React from 'react';
import { useTranslation } from 'react-i18next';
import { Empty, Typography } from '@/shared/antd-imports';

/** Empty state for the time log report tables, with a hint about what to try next. */
export const TimeLogsEmptyState: React.FC = () => {
  const { t } = useTranslation('time-report');

  return (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={
        <>
          <Typography.Text>
            {t('timeLogsReport.empty', { defaultValue: 'No time logged in this period' })}
          </Typography.Text>
          <br />
          <Typography.Text type="secondary">
            {t('timeLogsReport.emptyHint', {
              defaultValue: 'Try another date range or clear the filters.',
            })}
          </Typography.Text>
        </>
      }
    />
  );
};
