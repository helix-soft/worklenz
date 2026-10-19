import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import {
  Alert,
  Avatar,
  Button,
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  Flex,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Table,
  TableProps,
  Typography,
} from '@/shared/antd-imports';
import { leaveApiService } from '@/api/leave/leave.api.service';
import { ILeaveRequest, LeaveRequestStatus } from '@/types/leave/leave.types';
import { LeaveStatusTag, LeaveTypeTag } from '@/components/leave/leave-tags';
import logger from '@/utils/errorLogger';

export const LeaveRequestsTab = ({ onReviewed }: LeaveRequestsTabProps) => {
  const { t } = useTranslation('leave');
  const [filter, setFilter] = useState<LeaveRequestStatus | 'all'>('pending');
  const [requests, setRequests] = useState<ILeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [review, setReview] = useState<{ request: ILeaveRequest; decision: Decision } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const res = await leaveApiService.getRequests(filter === 'all' ? undefined : filter);
      if (res.done) setRequests(res.body);
      else setHasError(true);
    } catch (error) {
      logger.error('Error fetching leave requests', error);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await leaveApiService.deleteRequest(id);
      if (res.done) {
        fetchRequests();
        onReviewed?.();
      }
    } catch (error) {
      logger.error('Error deleting leave request', error);
    } finally {
      setDeletingId(null);
    }
  };

  const columns: TableProps<ILeaveRequest>['columns'] = useMemo(
    () => [
      {
        key: 'member',
        title: t('requests.columns.member', { defaultValue: 'Member' }),
        width: 200,
        render: (_, record) => (
          <Flex align="center" gap={8}>
            <Avatar size={28} src={record.member_avatar || undefined}>
              {record.member_name?.charAt(0)}
            </Avatar>
            <Typography.Text ellipsis>{record.member_name}</Typography.Text>
          </Flex>
        ),
      },
      {
        key: 'period',
        title: t('requests.columns.period', { defaultValue: 'Period' }),
        width: 210,
        render: (_, record) =>
          record.start_date === record.end_date
            ? record.start_date
            : `${record.start_date} – ${record.end_date}`,
      },
      {
        key: 'type',
        title: t('requests.columns.type', { defaultValue: 'Type' }),
        width: 120,
        render: (_, record) => <LeaveTypeTag type={record.type} />,
      },
      {
        key: 'reason',
        dataIndex: 'reason',
        title: t('requests.columns.reason', { defaultValue: 'Reason' }),
        ellipsis: true,
        render: (value: string | null) => value || '—',
      },
      {
        key: 'status',
        title: t('requests.columns.status', { defaultValue: 'Status' }),
        width: 220,
        render: (_, record) => (
          <Flex vertical gap={2}>
            <span>
              <LeaveStatusTag status={record.status} />
            </span>
            {record.reviewed_by_name && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {t('requests.reviewedBy', {
                  defaultValue: '{{name}}, {{date}}',
                  name: record.reviewed_by_name,
                  date: dayjs(record.reviewed_at).format('YYYY-MM-DD'),
                })}
              </Typography.Text>
            )}
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
        width: 260,
        align: 'right',
        render: (_, record) => (
          <Flex gap={8} justify="flex-end">
            {(record.status === 'pending' || record.status === 'rejected') && (
              <Button
                size="small"
                type={record.status === 'pending' ? 'primary' : 'default'}
                icon={<CheckOutlined />}
                onClick={() => setReview({ request: record, decision: 'approve' })}
              >
                {record.status === 'pending'
                  ? t('requests.approve', { defaultValue: 'Approve' })
                  : t('requests.changeToApproved', { defaultValue: 'Approve instead' })}
              </Button>
            )}
            {(record.status === 'pending' || record.status === 'approved') && (
              <Button
                size="small"
                danger
                icon={<CloseOutlined />}
                onClick={() => setReview({ request: record, decision: 'reject' })}
              >
                {record.status === 'pending'
                  ? t('requests.reject', { defaultValue: 'Reject' })
                  : t('requests.changeToRejected', { defaultValue: 'Reject instead' })}
              </Button>
            )}
            <Popconfirm
              title={
                record.status === 'approved'
                  ? t('requests.deleteApprovedConfirm', {
                      defaultValue:
                        'Delete this request? Its approved time off is removed and the days are returned to the allowance.',
                    })
                  : t('requests.deleteConfirm', {
                      defaultValue: 'Delete this request permanently?',
                    })
              }
              okText={t('delete', { defaultValue: 'Delete' })}
              okButtonProps={{ danger: true }}
              cancelText={t('cancel', { defaultValue: 'Cancel' })}
              onConfirm={() => handleDelete(record.id)}
            >
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                loading={deletingId === record.id}
                aria-label={t('delete', { defaultValue: 'Delete' })}
              />
            </Popconfirm>
          </Flex>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, deletingId]
  );

  return (
    <Flex vertical gap={16}>
      <Segmented
        value={filter}
        onChange={value => setFilter(value as LeaveRequestStatus | 'all')}
        options={FILTERS.map(value => ({
          value,
          label: t(`requests.filter.${value}`, { defaultValue: FILTER_LABELS[value] }),
        }))}
        style={{ alignSelf: 'flex-start' }}
      />
      {hasError ? (
        <Alert
          type="error"
          showIcon
          message={t('loadError', { defaultValue: 'Could not load data.' })}
          action={
            <Button size="small" onClick={fetchRequests}>
              {t('retry', { defaultValue: 'Retry' })}
            </Button>
          }
        />
      ) : (
        <Table<ILeaveRequest>
          rowKey="id"
          size="middle"
          loading={isLoading}
          columns={columns}
          dataSource={requests}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          scroll={{ x: 'max-content' }}
          locale={{
            emptyText: t('requests.empty', { defaultValue: 'There are no leave requests here.' }),
          }}
        />
      )}
      <ReviewModal
        review={review}
        onClose={() => setReview(null)}
        onDone={() => {
          fetchRequests();
          onReviewed?.();
        }}
      />
    </Flex>
  );
};

const ReviewModal = ({
  review,
  onClose,
  onDone,
}: {
  review: { request: ILeaveRequest; decision: Decision } | null;
  onClose: () => void;
  onDone: () => void;
}) => {
  const { t } = useTranslation('leave');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => setNote(''), [review]);

  const handleOk = async () => {
    if (!review) return;
    setIsSaving(true);
    try {
      const res = await leaveApiService.reviewRequest(
        review.request.id,
        review.decision,
        note.trim()
      );
      if (res.done) {
        onDone();
        onClose();
      }
    } catch (error) {
      logger.error('Error reviewing leave request', error);
    } finally {
      setIsSaving(false);
    }
  };

  const isApprove = review?.decision === 'approve';
  const isChange = !!review && review.request.status !== 'pending';
  return (
    <Modal
      open={!!review}
      title={
        isApprove
          ? t('requests.approveTitle', { defaultValue: 'Approve leave request' })
          : t('requests.rejectTitle', { defaultValue: 'Reject leave request' })
      }
      okText={
        isApprove
          ? t('requests.approve', { defaultValue: 'Approve' })
          : t('requests.reject', { defaultValue: 'Reject' })
      }
      okButtonProps={{ danger: !isApprove }}
      cancelText={t('cancel', { defaultValue: 'Cancel' })}
      confirmLoading={isSaving}
      onOk={handleOk}
      onCancel={onClose}
    >
      {review && (
        <Flex vertical gap={12}>
          <Typography.Text>
            {t('requests.reviewSummary', {
              defaultValue: '{{name}}: {{start}} – {{end}}',
              name: review.request.member_name,
              start: review.request.start_date,
              end: review.request.end_date,
            })}
          </Typography.Text>
          {isChange && (
            <Alert
              type="warning"
              showIcon
              message={
                isApprove
                  ? t('requests.changeToApprovedHint', {
                      defaultValue:
                        'This request was rejected. Approving it now records the time off and deducts the days.',
                    })
                  : t('requests.changeToRejectedHint', {
                      defaultValue:
                        'This request was approved. Rejecting it now removes the time off and returns the days.',
                    })
              }
            />
          )}
          <Input.TextArea
            rows={3}
            maxLength={500}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={t('requests.notePlaceholder', { defaultValue: 'Note (optional)' })}
            aria-label={t('requests.notePlaceholder', { defaultValue: 'Note (optional)' })}
          />
        </Flex>
      )}
    </Modal>
  );
};

type Decision = 'approve' | 'reject';

interface LeaveRequestsTabProps {
  onReviewed?: () => void;
}

const FILTERS: (LeaveRequestStatus | 'all')[] = ['pending', 'approved', 'rejected', 'all'];

const FILTER_LABELS: Record<LeaveRequestStatus | 'all', string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  all: 'All',
};
