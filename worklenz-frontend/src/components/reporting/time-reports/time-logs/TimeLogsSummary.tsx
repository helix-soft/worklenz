import React, { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { Card, Col, Flex, Row, Select, Table, Typography, theme } from '@/shared/antd-imports';
import type { ColumnsType } from 'antd/es/table';
import {
  ITimeLogEntry,
  ITimeLogsGroupNode,
  TimeLogsGroupBy,
} from '@/types/reporting/time-logs-report.types';
import {
  buildTimeBuckets,
  formatDurationClock,
  getTotalSeconds,
  groupTimeLogs,
  TimeLogsDateRange,
} from '@/utils/time-logs-report';
import { TimeLogsEmptyState } from './TimeLogsEmptyState';
import { TimeLogsBarChart, TimeLogsDonutChart } from './TimeLogsCharts';

interface TimeLogsSummaryProps {
  entries: ITimeLogEntry[];
  range: TimeLogsDateRange;
  isLoading: boolean;
}

/** Clockify-like summary: total, logged time over the period, grouped breakdown and share. */
export const TimeLogsSummary: React.FC<TimeLogsSummaryProps> = memo(
  ({ entries, range, isLoading }) => {
    const { t } = useTranslation('time-report');
    const { token } = theme.useToken();
    const [primaryGroup, setPrimaryGroup] = useState<TimeLogsGroupBy>('project');
    const [secondaryGroup, setSecondaryGroup] = useState<TimeLogsGroupBy | 'none'>('description');

    const getGroupLabel = useCallback((node: ITimeLogsGroupNode) => getNodeLabel(node, t), [t]);

    const totalSeconds = useMemo(() => getTotalSeconds(entries), [entries]);
    const tree = useMemo(
      () => groupTimeLogs(entries, primaryGroup, secondaryGroup === 'none' ? null : secondaryGroup),
      [entries, primaryGroup, secondaryGroup]
    );
    const buckets = useMemo(
      () => buildTimeBuckets(entries, range, primaryGroup),
      [entries, range, primaryGroup]
    );

    const groupOptions = useMemo(
      () =>
        GROUP_BY_OPTIONS.map(option => ({
          value: option.value,
          label: t(`timeLogsReport.groupByOptions.${option.value}`, {
            defaultValue: option.defaultValue,
          }),
        })),
      [t]
    );

    const columns: ColumnsType<ITimeLogsGroupNode> = useMemo(
      () => [
        {
          title: t('timeLogsReport.columns.title', { defaultValue: 'Title' }),
          key: 'title',
          render: (_, node) => (
            <Flex align="center" gap={8} style={{ minWidth: 0 }}>
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: node.color,
                  flexShrink: 0,
                }}
              />
              <Typography.Text
                ellipsis={{ tooltip: getGroupLabel(node) }}
                type={node.label ? undefined : 'secondary'}
              >
                {getGroupLabel(node)}
              </Typography.Text>
              {node.subLabel && (
                <Typography.Text type="secondary" ellipsis style={{ flexShrink: 1 }}>
                  - {node.subLabel}
                </Typography.Text>
              )}
              {node.children && (
                <Typography.Text type="secondary" style={{ fontSize: 12, flexShrink: 0 }}>
                  ({node.children.length})
                </Typography.Text>
              )}
            </Flex>
          ),
        },
        {
          title: t('timeLogsReport.columns.duration', { defaultValue: 'Duration' }),
          dataIndex: 'seconds',
          key: 'seconds',
          align: 'right',
          width: 120,
          sorter: (a, b) => a.seconds - b.seconds,
          render: (seconds: number) => (
            <Typography.Text strong style={{ fontVariantNumeric: 'tabular-nums' }}>
              {formatDurationClock(seconds)}
            </Typography.Text>
          ),
        },
        {
          title: t('timeLogsReport.columns.share', { defaultValue: 'Share' }),
          dataIndex: 'percent',
          key: 'percent',
          align: 'right',
          width: 90,
          responsive: ['sm'],
          render: (percent: number) => (
            <Typography.Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {percent.toFixed(1)}%
            </Typography.Text>
          ),
        },
      ],
      [getGroupLabel, t]
    );

    return (
      <Flex vertical gap={16}>
        <Card
          style={{ borderRadius: 8 }}
          loading={isLoading && entries.length === 0}
          title={
            <Flex align="baseline" gap={8}>
              <Typography.Text type="secondary" style={{ fontWeight: 400 }}>
                {t('timeLogsReport.total', { defaultValue: 'Total' })}:
              </Typography.Text>
              <Typography.Text strong style={{ fontSize: 20 }}>
                {formatDurationClock(totalSeconds)}
              </Typography.Text>
            </Flex>
          }
        >
          <TimeLogsBarChart buckets={buckets} groups={tree} getGroupLabel={getGroupLabel} />
        </Card>

        <Card
          style={{ borderRadius: 8 }}
          styles={{ body: { padding: 0 } }}
          title={
            <Flex align="center" gap={8} wrap style={{ padding: '8px 0' }}>
              <Typography.Text type="secondary" style={{ fontWeight: 400 }}>
                {t('timeLogsReport.groupBy', { defaultValue: 'Group by' })}:
              </Typography.Text>
              <Select
                size="small"
                style={{ width: 140 }}
                aria-label={t('timeLogsReport.groupBy', { defaultValue: 'Group by' })}
                value={primaryGroup}
                options={groupOptions}
                onChange={value => {
                  setPrimaryGroup(value);
                  if (value === secondaryGroup) setSecondaryGroup('none');
                }}
              />
              <Select
                size="small"
                style={{ width: 140 }}
                aria-label={t('timeLogsReport.thenBy', { defaultValue: 'Then by' })}
                value={secondaryGroup}
                onChange={setSecondaryGroup}
                options={[
                  {
                    value: 'none',
                    label: t('timeLogsReport.groupByOptions.none', { defaultValue: '(None)' }),
                  },
                  ...groupOptions.filter(option => option.value !== primaryGroup),
                ]}
              />
            </Flex>
          }
        >
          <Row>
            <Col xs={24} lg={16} style={{ borderRight: `1px solid ${token.colorBorderSecondary}` }}>
              <Table<ITimeLogsGroupNode>
                size="middle"
                rowKey="key"
                loading={isLoading}
                columns={columns}
                dataSource={tree}
                pagination={tree.length > 50 ? { pageSize: 50, showSizeChanger: false } : false}
                expandable={{ indentSize: 24 }}
                scroll={{ x: 'max-content' }}
                locale={{ emptyText: <TimeLogsEmptyState /> }}
              />
            </Col>
            <Col xs={24} lg={8}>
              <Flex align="center" justify="center" style={{ padding: 24, height: '100%' }}>
                {tree.length > 0 && (
                  <TimeLogsDonutChart
                    groups={tree}
                    totalSeconds={totalSeconds}
                    getGroupLabel={getGroupLabel}
                  />
                )}
              </Flex>
            </Col>
          </Row>
        </Card>
      </Flex>
    );
  }
);

TimeLogsSummary.displayName = 'TimeLogsSummary';

// Helpers
const getNodeLabel = (
  node: ITimeLogsGroupNode,
  t: (key: string, options: Record<string, unknown>) => string
): string => {
  if (node.dimension === 'date') return dayjs(node.label).format('ddd, MMM D, YYYY');
  if (node.label) return node.label;
  if (node.dimension === 'client') {
    return t('timeLogsReport.noClient', { defaultValue: 'Without client' });
  }
  if (node.dimension === 'description') {
    return t('timeLogsReport.noDescription', { defaultValue: '(no description)' });
  }
  return t('timeLogsReport.unknown', { defaultValue: '(unknown)' });
};

// Static content
const GROUP_BY_OPTIONS: { value: TimeLogsGroupBy; defaultValue: string }[] = [
  { value: 'project', defaultValue: 'Project' },
  { value: 'client', defaultValue: 'Client' },
  { value: 'member', defaultValue: 'Member' },
  { value: 'task', defaultValue: 'Task' },
  { value: 'date', defaultValue: 'Date' },
  { value: 'description', defaultValue: 'Description' },
];
