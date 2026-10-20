import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs, { Dayjs } from 'dayjs';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Flex,
  List,
  PlusOutlined,
  Popconfirm,
  Row,
  Segmented,
  Skeleton,
  Statistic,
  Table,
  TableProps,
  Typography,
} from '@/shared/antd-imports';
import { useDocumentTitle } from '@/hooks/useDoumentTItle';
import { leaveApiService } from '@/api/leave/leave.api.service';
import {
  ILeaveRequest,
  IMyLeaveOverview,
  IMyWorkLocations,
  WorkLocation,
} from '@/types/leave/leave.types';
import { LeaveStatusTag, LeaveTypeTag } from '@/components/leave/leave-tags';
import { notifyWorkLocationChanged } from '@/components/leave/work-location-check-in';
import { RequestLeaveModal } from '@/components/leave/request-leave-modal';
import logger from '@/utils/errorLogger';

const MyLeaveSettings = () => {
  const { t } = useTranslation('leave');
  useDocumentTitle(t('my.title', { defaultValue: 'My leave' }));

  return (
    // Full width like the other Settings pages (Notifications, Change Password).
    <Flex vertical gap={16} style={{ width: '100%' }}>
      <LeaveOverviewCard />
      <WorkLocationsCard />
    </Flex>
  );
};

const LeaveOverviewCard = () => {
  const { t } = useTranslation('leave');
  const [year, setYear] = useState<Dayjs>(dayjs().startOf('year'));
  const [overview, setOverview] = useState<IMyLeaveOverview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isRequestOpen, setIsRequestOpen] = useState(false);

  const fetchOverview = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const res = await leaveApiService.getMyOverview(year.year());
      if (res.done) setOverview(res.body);
      else setHasError(true);
    } catch (error) {
      logger.error('Error fetching my leave overview', error);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [year]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const handleCancel = async (id: string) => {
    try {
      const res = await leaveApiService.cancelRequest(id);
      if (res.done) fetchOverview();
    } catch (error) {
      logger.error('Error cancelling leave request', error);
    }
  };

  const columns: TableProps<ILeaveRequest>['columns'] = useMemo(
    () => [
      {
        key: 'period',
        title: t('requests.columns.period', { defaultValue: 'Period' }),
        render: (_, record) =>
          record.start_date === record.end_date
            ? record.start_date
            : `${record.start_date} – ${record.end_date}`,
      },
      {
        key: 'type',
        title: t('requests.columns.type', { defaultValue: 'Type' }),
        render: (_, record) => <LeaveTypeTag type={record.type} />,
      },
      {
        key: 'status',
        title: t('requests.columns.status', { defaultValue: 'Status' }),
        render: (_, record) => (
          <Flex vertical gap={2}>
            <span>
              <LeaveStatusTag status={record.status} />
            </span>
            {record.review_note && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {record.review_note}
              </Typography.Text>
            )}
          </Flex>
        ),
      },
      {
        key: 'actions',
        align: 'right',
        render: (_, record) =>
          record.status === 'pending' ? (
            <Popconfirm
              title={t('my.cancelConfirm', { defaultValue: 'Cancel this leave request?' })}
              okText={t('yes', { defaultValue: 'Yes' })}
              cancelText={t('no', { defaultValue: 'No' })}
              onConfirm={() => handleCancel(record.id)}
            >
              <Button size="small">
                {t('my.cancelRequest', { defaultValue: 'Cancel request' })}
              </Button>
            </Popconfirm>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t]
  );

  const balance = overview?.balance;

  return (
    <Card
      title={t('my.title', { defaultValue: 'My leave' })}
      extra={
        <Flex gap={8} align="center">
          <DatePicker
            picker="year"
            allowClear={false}
            value={year}
            onChange={value => value && setYear(value.startOf('year'))}
            aria-label={t('balances.yearPicker', { defaultValue: 'Select year' })}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsRequestOpen(true)}>
            {t('my.requestLeave', { defaultValue: 'Request leave' })}
          </Button>
        </Flex>
      }
    >
      {hasError ? (
        <Alert
          type="error"
          showIcon
          message={t('loadError', { defaultValue: 'Could not load data.' })}
          action={
            <Button size="small" onClick={fetchOverview}>
              {t('retry', { defaultValue: 'Retry' })}
            </Button>
          }
        />
      ) : isLoading && !overview ? (
        <Skeleton active />
      ) : (
        <Flex vertical gap={24}>
          {balance?.base_days === null && (
            <Alert
              type="warning"
              showIcon
              message={t('my.noAllowance', {
                defaultValue:
                  'Your leave allowance for this year has not been set yet. Ask an admin to set it.',
              })}
            />
          )}
          <Row gutter={[16, 16]}>
            <Col xs={12} md={6}>
              <Statistic
                title={t('balances.columns.total', { defaultValue: 'Total' })}
                value={balance?.total_days ?? 0}
              />
            </Col>
            <Col xs={12} md={6}>
              <Statistic
                title={t('balances.columns.used', { defaultValue: 'Used' })}
                value={balance?.used_days ?? 0}
              />
            </Col>
            <Col xs={12} md={6}>
              <Statistic
                title={t('balances.columns.pending', { defaultValue: 'Pending' })}
                value={balance?.pending_days ?? 0}
              />
            </Col>
            <Col xs={12} md={6}>
              <Statistic
                title={t('balances.columns.remaining', { defaultValue: 'Remaining' })}
                value={balance?.remaining_days ?? 0}
              />
            </Col>
          </Row>

          <div>
            <Typography.Title level={5}>
              {t('my.requestsTitle', { defaultValue: 'My leave requests' })}
            </Typography.Title>
            <Table<ILeaveRequest>
              rowKey="id"
              size="small"
              columns={columns}
              dataSource={overview?.requests || []}
              loading={isLoading}
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
              scroll={{ x: 'max-content' }}
              locale={{
                emptyText: t('my.noRequests', {
                  defaultValue: 'You have no leave requests this year.',
                }),
              }}
            />
          </div>

          {!!overview?.adjustments.length && (
            <div>
              <Typography.Title level={5}>
                {t('my.extraDaysTitle', { defaultValue: 'Extra days granted' })}
              </Typography.Title>
              <List
                size="small"
                dataSource={overview.adjustments}
                renderItem={item => (
                  <List.Item>
                    <Flex vertical gap={2}>
                      <Typography.Text>
                        <Typography.Text strong>+{item.days}</Typography.Text> — {item.note}
                      </Typography.Text>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {t('balances.addedBy', {
                          defaultValue: 'Added by {{name}}',
                          name: item.created_by_name || '—',
                        })}
                        {' · '}
                        {dayjs(item.created_at).format('YYYY-MM-DD')}
                      </Typography.Text>
                      {item.updated_at && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          {t('balances.editedBy', {
                            defaultValue: 'Edited by {{name}} on {{date}}',
                            name: item.updated_by_name || '—',
                            date: dayjs(item.updated_at).format('YYYY-MM-DD HH:mm'),
                          })}
                        </Typography.Text>
                      )}
                    </Flex>
                  </List.Item>
                )}
              />
            </div>
          )}
        </Flex>
      )}

      <RequestLeaveModal
        open={isRequestOpen}
        onClose={() => setIsRequestOpen(false)}
        onCreated={fetchOverview}
      />
    </Card>
  );
};

const WorkLocationsCard = () => {
  const { t } = useTranslation('leave');
  const [month, setMonth] = useState<Dayjs>(dayjs().startOf('month'));
  const [data, setData] = useState<IMyWorkLocations | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [savingDate, setSavingDate] = useState<string | null>(null);

  const fetchLocations = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const res = await leaveApiService.getMyLocations(month.year(), month.month() + 1);
      if (res.done) setData(res.body);
      else setHasError(true);
    } catch (error) {
      logger.error('Error fetching work locations', error);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [month]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const today = dayjs().format('YYYY-MM-DD');
  const locationByDate = useMemo(
    () => new Map((data?.locations || []).map(l => [l.work_date, l.location])),
    [data]
  );
  // Work days up to today without leave, plus any non-work day that already has a check-in.
  const days = useMemo(() => {
    if (!data) return [];
    const leaveDates = new Set(data.leave_dates);
    const extra = data.non_work_dates.filter(date => locationByDate.has(date));
    return [...data.work_day_dates, ...extra]
      .filter(date => date <= today && !leaveDates.has(date))
      .sort()
      .reverse();
  }, [data, locationByDate, today]);

  const handleChange = async (date: string, value: WorkLocation | 'none') => {
    setSavingDate(date);
    try {
      const res = await leaveApiService.setLocation(date, value === 'none' ? null : value);
      if (res.done) {
        await fetchLocations();
        if (date === today) notifyWorkLocationChanged();
      }
    } catch (error) {
      logger.error('Error saving work location', error);
    } finally {
      setSavingDate(null);
    }
  };

  return (
    <Card
      title={t('location.title', { defaultValue: 'Where I worked' })}
      extra={
        <DatePicker
          picker="month"
          allowClear={false}
          value={month}
          disabledDate={date => date.isAfter(dayjs(), 'month')}
          onChange={value => value && setMonth(value.startOf('month'))}
          aria-label={t('summary.monthPicker', { defaultValue: 'Select month' })}
        />
      }
    >
      {hasError ? (
        <Alert
          type="error"
          showIcon
          message={t('loadError', { defaultValue: 'Could not load data.' })}
          action={
            <Button size="small" onClick={fetchLocations}>
              {t('retry', { defaultValue: 'Retry' })}
            </Button>
          }
        />
      ) : isLoading && !data ? (
        <Skeleton active />
      ) : (
        <Flex vertical gap={16}>
          {data && (
            <Row gutter={[16, 16]}>
              <Col xs={12} md={6}>
                <Statistic
                  title={t('summary.columns.worked_days', { defaultValue: 'Worked days' })}
                  value={data.summary.worked_days}
                />
              </Col>
              <Col xs={12} md={6}>
                <Statistic
                  title={t('summary.columns.office_days', { defaultValue: 'Office days' })}
                  value={data.summary.office_days}
                />
              </Col>
              <Col xs={12} md={6}>
                <Statistic
                  title={t('summary.columns.remote_days', { defaultValue: 'Remote days' })}
                  value={data.summary.remote_days}
                />
              </Col>
              <Col xs={12} md={6}>
                <Statistic
                  title={t('summary.columns.leave_days', { defaultValue: 'Leave days' })}
                  value={data.summary.leave_days}
                />
              </Col>
            </Row>
          )}
          {days.length === 0 ? (
            <Empty
              description={t('location.noDays', { defaultValue: 'No work days to show yet.' })}
            />
          ) : (
            <List
              size="small"
              dataSource={days}
              renderItem={date => (
                <List.Item>
                  <Flex
                    justify="space-between"
                    align="center"
                    wrap="wrap"
                    gap={8}
                    style={{ width: '100%' }}
                  >
                    <Typography.Text>{dayjs(date).format('YYYY-MM-DD, dddd')}</Typography.Text>
                    <Segmented
                      size="small"
                      disabled={savingDate === date}
                      value={locationByDate.get(date) || 'none'}
                      onChange={value => handleChange(date, value as WorkLocation | 'none')}
                      options={[
                        {
                          value: 'office',
                          label: t('location.office', { defaultValue: 'Office' }),
                        },
                        {
                          value: 'remote',
                          label: t('location.remote', { defaultValue: 'Remote' }),
                        },
                        { value: 'none', label: t('location.none', { defaultValue: 'Not set' }) },
                      ]}
                    />
                  </Flex>
                </List.Item>
              )}
            />
          )}
        </Flex>
      )}
    </Card>
  );
};

export default MyLeaveSettings;
