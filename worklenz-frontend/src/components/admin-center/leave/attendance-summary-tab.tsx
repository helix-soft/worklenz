import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs, { Dayjs } from 'dayjs';
import { FilePdfOutlined } from '@ant-design/icons';
import {
  Alert,
  Avatar,
  Button,
  DatePicker,
  Flex,
  Table,
  TableProps,
  Tooltip,
  Typography,
} from '@/shared/antd-imports';
import { leaveApiService } from '@/api/leave/leave.api.service';
import { IAttendanceMemberRow, IAttendanceReport } from '@/types/leave/leave.types';
import logger from '@/utils/errorLogger';

export const AttendanceSummaryTab = () => {
  const { t } = useTranslation('leave');
  const [month, setMonth] = useState<Dayjs>(dayjs().startOf('month'));
  const [report, setReport] = useState<IAttendanceReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [hasError, setHasError] = useState(false);

  const fetchReport = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const res = await leaveApiService.getAttendance(month.year(), month.month() + 1);
      if (res.done) setReport(res.body);
      else setHasError(true);
    } catch (error) {
      logger.error('Error fetching attendance report', error);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [month]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await leaveApiService.downloadAttendanceReport(month.year(), month.month() + 1);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `raport-prezenta-${month.format('YYYY-MM')}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      logger.error('Error exporting attendance report', error);
    } finally {
      setIsExporting(false);
    }
  };

  const columns: TableProps<IAttendanceMemberRow>['columns'] = useMemo(
    () => [
      {
        key: 'name',
        title: t('summary.columns.name', { defaultValue: 'Name' }),
        fixed: 'left',
        width: 220,
        render: (_, record) => (
          <Flex align="center" gap={8}>
            <Avatar size={28} src={record.avatar_url || undefined}>
              {record.name?.charAt(0)}
            </Avatar>
            <Flex vertical style={{ minWidth: 0 }}>
              <Typography.Text ellipsis>{record.name}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                {record.email}
              </Typography.Text>
            </Flex>
          </Flex>
        ),
      },
      {
        ...numberColumn(
          'worked_days',
          t('summary.columns.worked_days', { defaultValue: 'Worked days' })
        ),
        render: (value: number) => <Typography.Text strong>{value}</Typography.Text>,
      },
      {
        ...numberColumn(
          'logged_hours',
          t('summary.columns.logged_hours', { defaultValue: 'Hours (expected / logged)' })
        ),
        width: 180,
        render: (_: number, record: IAttendanceMemberRow) => (
          <Tooltip
            title={t('summary.hoursHint', {
              defaultValue: 'Expected = worked days × daily hours. Logged = time logged on tasks.',
            })}
          >
            <span style={{ whiteSpace: 'nowrap' }}>
              {formatHours(record.expected_hours)} / {formatHours(record.logged_hours)}
            </span>
          </Tooltip>
        ),
      },
      numberColumn(
        'office_days',
        t('summary.columns.office_days', { defaultValue: 'Office days' })
      ),
      numberColumn(
        'remote_days',
        t('summary.columns.remote_days', { defaultValue: 'Remote days' })
      ),
      numberColumn('leave_days', t('summary.columns.leave_days', { defaultValue: 'Leave days' })),
      {
        ...numberColumn(
          'extra_worked_days',
          t('summary.columns.extra_worked_days', { defaultValue: 'Worked on non-work days' })
        ),
        render: (value: number) =>
          value > 0 ? (
            <Tooltip
              title={t('summary.extraWorkedHint', {
                defaultValue:
                  'Checked in on a weekend or holiday. You can grant extra leave days for it.',
              })}
            >
              <Typography.Text type="warning">{value}</Typography.Text>
            </Tooltip>
          ) : (
            value
          ),
      },
    ],
    [t]
  );

  return (
    <Flex vertical gap={16}>
      <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
        <Flex align="center" gap={12} wrap="wrap">
          <DatePicker
            picker="month"
            allowClear={false}
            value={month}
            onChange={value => value && setMonth(value.startOf('month'))}
            aria-label={t('summary.monthPicker', { defaultValue: 'Select month' })}
          />
          {report && (
            <Typography.Text type="secondary">
              {t('summary.workDaysInMonth', {
                defaultValue: 'Official work days in this month: {{count}}',
                count: report.work_days,
              })}
            </Typography.Text>
          )}
        </Flex>
        <Button
          type="primary"
          icon={<FilePdfOutlined />}
          loading={isExporting}
          disabled={!report?.members.length}
          onClick={handleExport}
        >
          {t('summary.exportPdf', { defaultValue: 'Download PDF report' })}
        </Button>
      </Flex>

      {hasError ? (
        <Alert
          type="error"
          showIcon
          message={t('loadError', { defaultValue: 'Could not load data.' })}
          action={
            <Button size="small" onClick={fetchReport}>
              {t('retry', { defaultValue: 'Retry' })}
            </Button>
          }
        />
      ) : (
        <Table<IAttendanceMemberRow>
          rowKey="team_member_id"
          size="middle"
          loading={isLoading}
          columns={columns}
          dataSource={report?.members || []}
          pagination={false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: t('summary.empty', { defaultValue: 'No team members found.' }) }}
        />
      )}
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {t('summary.footnote', {
          defaultValue:
            'Official work days = Monday to Friday minus official holidays. Worked days = official work days minus approved vacation and sick leave; this is also the meal voucher count.',
        })}
      </Typography.Text>
    </Flex>
  );
};

/** 176 -> "176", 14.4500 -> "14.45" */
const formatHours = (value: number) => String(Math.round(value * 100) / 100);

const numberColumn = (key: keyof IAttendanceMemberRow, title: string) => ({
  key,
  dataIndex: key,
  title,
  align: 'right' as const,
  width: 120,
});
