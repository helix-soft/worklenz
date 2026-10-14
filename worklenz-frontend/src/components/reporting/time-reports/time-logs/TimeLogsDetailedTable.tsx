import React, { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { Avatar, Card, Flex, Table, Tag, Typography } from '@/shared/antd-imports';
import type { ColumnsType } from 'antd/es/table';
import { ITimeLogEntry } from '@/types/reporting/time-logs-report.types';
import { TimeLogsEmptyState } from './TimeLogsEmptyState';
import { formatDurationClock, getTotalSeconds } from '@/utils/time-logs-report';

interface TimeLogsDetailedTableProps {
  entries: ITimeLogEntry[];
  isLoading: boolean;
}

/** One row per time log, like Clockify's detailed report. */
export const TimeLogsDetailedTable: React.FC<TimeLogsDetailedTableProps> = memo(
  ({ entries, isLoading }) => {
    const { t } = useTranslation('time-report');
    const [pageSize, setPageSize] = useState(50);

    const totalSeconds = useMemo(() => getTotalSeconds(entries), [entries]);

    const columns: ColumnsType<ITimeLogEntry> = useMemo(
      () => [
        {
          title: t('timeLogsReport.columns.date', { defaultValue: 'Date' }),
          dataIndex: 'date',
          key: 'date',
          width: 130,
          sorter: (a, b) => a.date.localeCompare(b.date),
          defaultSortOrder: 'descend',
          render: (date: string) => dayjs(date).format('MMM D, YYYY'),
        },
        {
          title: t('timeLogsReport.columns.description', { defaultValue: 'Description' }),
          dataIndex: 'description',
          key: 'description',
          render: (description: string, entry) => (
            <Flex vertical style={{ minWidth: 200, maxWidth: 420 }}>
              <Typography.Text
                ellipsis={{ tooltip: description }}
                type={description ? undefined : 'secondary'}
              >
                {description ||
                  t('timeLogsReport.noDescription', { defaultValue: '(no description)' })}
              </Typography.Text>
              <Typography.Text type="secondary" ellipsis style={{ fontSize: 12 }}>
                {entry.taskName}
              </Typography.Text>
            </Flex>
          ),
        },
        {
          title: t('timeLogsReport.columns.project', { defaultValue: 'Project' }),
          dataIndex: 'projectName',
          key: 'project',
          width: 240,
          sorter: (a, b) => a.projectName.localeCompare(b.projectName),
          render: (projectName: string, entry) => (
            <Flex align="center" gap={6} style={{ minWidth: 0 }}>
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: entry.projectColor || undefined,
                  flexShrink: 0,
                }}
              />
              <Typography.Text ellipsis>{projectName}</Typography.Text>
              {entry.clientName && (
                <Typography.Text type="secondary" ellipsis>
                  - {entry.clientName}
                </Typography.Text>
              )}
            </Flex>
          ),
        },
        {
          title: t('timeLogsReport.columns.member', { defaultValue: 'Member' }),
          dataIndex: 'userName',
          key: 'member',
          width: 190,
          sorter: (a, b) => a.userName.localeCompare(b.userName),
          render: (userName: string, entry) => (
            <Flex align="center" gap={8}>
              <Avatar size={24} src={entry.userAvatarUrl || undefined}>
                {userName.charAt(0).toUpperCase()}
              </Avatar>
              <Typography.Text ellipsis>{userName}</Typography.Text>
            </Flex>
          ),
        },
        {
          title: t('timeLogsReport.columns.billable', { defaultValue: 'Billable' }),
          dataIndex: 'billable',
          key: 'billable',
          width: 110,
          responsive: ['md'],
          render: (billable: boolean) =>
            billable ? (
              <Tag color="green" bordered={false}>
                {t('timeLogsReport.filters.billableOnly', { defaultValue: 'Billable' })}
              </Tag>
            ) : (
              <Tag bordered={false}>
                {t('timeLogsReport.filters.nonBillableOnly', { defaultValue: 'Non-billable' })}
              </Tag>
            ),
        },
        {
          title: t('timeLogsReport.columns.duration', { defaultValue: 'Duration' }),
          dataIndex: 'seconds',
          key: 'seconds',
          width: 110,
          align: 'right',
          sorter: (a, b) => a.seconds - b.seconds,
          render: (seconds: number) => (
            <Typography.Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatDurationClock(seconds)}
            </Typography.Text>
          ),
        },
      ],
      [t]
    );

    return (
      <Card
        style={{ borderRadius: 8 }}
        styles={{ body: { padding: 0 } }}
        title={
          <Flex align="baseline" gap={8}>
            <Typography.Text type="secondary" style={{ fontWeight: 400 }}>
              {t('timeLogsReport.total', { defaultValue: 'Total' })}:
            </Typography.Text>
            <Typography.Text strong style={{ fontSize: 20 }}>
              {formatDurationClock(totalSeconds)}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontWeight: 400, fontSize: 13 }}>
              {t('timeLogsReport.entryCount', {
                defaultValue: '{{count}} entries',
                count: entries.length,
              })}
            </Typography.Text>
          </Flex>
        }
      >
        <Table<ITimeLogEntry>
          size="middle"
          rowKey="id"
          loading={isLoading}
          dataSource={entries}
          columns={columns}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: <TimeLogsEmptyState /> }}
          pagination={{
            pageSize,
            showSizeChanger: true,
            pageSizeOptions: ['20', '50', '100', '200'],
            onShowSizeChange: (_current, size) => setPageSize(size),
          }}
        />
      </Card>
    );
  }
);

TimeLogsDetailedTable.displayName = 'TimeLogsDetailedTable';
