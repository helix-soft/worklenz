import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs, { Dayjs } from 'dayjs';
import {
  Button,
  DatePicker,
  Flex,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Typography,
} from '@/shared/antd-imports';
import { useAuthService } from '@/hooks/useAuth';
import { useDeleteTimeOffMutation, useUpdateTimeOffMutation } from '@/api/schedule/scheduleApi';
import { LeaveType } from '@/types/leave/leave.types';
import { LEAVE_TYPES, TYPE_LABELS } from '@/components/leave/leave-tags';
import logger from '@/utils/errorLogger';

/**
 * Details of a recorded leave, in the same layout as the "Request leave" dialog.
 * Owner/Admin can change or delete it; other members see it read-only.
 */
export const LeaveDetailsModal = ({ entry, onClose }: LeaveDetailsModalProps) => {
  const { t } = useTranslation('leave');
  const [form] = Form.useForm<LeaveFormValues>();
  const canEdit = useAuthService().isOwnerOrAdmin();
  const [updateTimeOff, { isLoading: isSaving }] = useUpdateTimeOffMutation();
  const [deleteTimeOff, { isLoading: isDeleting }] = useDeleteTimeOffMutation();

  useEffect(() => {
    if (!entry) return;
    form.setFieldsValue({
      range: [dayjs(entry.start_date), dayjs(entry.end_date)],
      type: entry.type || 'vacation',
      reason: entry.reason || '',
    });
  }, [entry, form]);

  const handleSave = async (values: LeaveFormValues) => {
    if (!entry) return;
    try {
      const [start, end] = values.range;
      await updateTimeOff({
        id: entry.id,
        start_date: start.format('YYYY-MM-DD'),
        end_date: end.format('YYYY-MM-DD'),
        type: values.type,
        reason: values.reason?.trim() || '',
        is_full_day: true,
        hours_off: null,
      }).unwrap();
      onClose();
    } catch (error) {
      logger.error('Error updating leave', error);
    }
  };

  const handleDelete = async () => {
    if (!entry) return;
    try {
      await deleteTimeOff(entry.id).unwrap();
      onClose();
    } catch (error) {
      logger.error('Error deleting leave', error);
    }
  };

  const footer = canEdit ? (
    <Flex justify="space-between" align="center">
      <Popconfirm
        title={t('details.deleteConfirm', {
          defaultValue: 'Delete this leave? The days are returned to the allowance.',
        })}
        okText={t('delete', { defaultValue: 'Delete' })}
        okButtonProps={{ danger: true }}
        cancelText={t('cancel', { defaultValue: 'Cancel' })}
        onConfirm={handleDelete}
      >
        <Button danger loading={isDeleting}>
          {t('delete', { defaultValue: 'Delete' })}
        </Button>
      </Popconfirm>
      <Flex gap={8}>
        <Button onClick={onClose}>{t('cancel', { defaultValue: 'Cancel' })}</Button>
        <Button type="primary" loading={isSaving} onClick={() => form.submit()}>
          {t('save', { defaultValue: 'Save' })}
        </Button>
      </Flex>
    </Flex>
  ) : (
    <Button onClick={onClose}>{t('close', { defaultValue: 'Close' })}</Button>
  );

  return (
    <Modal
      open={!!entry}
      title={
        canEdit
          ? t('details.editTitle', { defaultValue: 'Edit leave' })
          : t('details.title', { defaultValue: 'Leave details' })
      }
      onCancel={onClose}
      footer={footer}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={handleSave} disabled={!canEdit}>
        <Form.Item
          name="range"
          label={t('my.period', { defaultValue: 'Period' })}
          rules={[
            {
              required: true,
              message: t('my.periodRequired', { defaultValue: 'Select the first and last day' }),
            },
          ]}
        >
          <DatePicker.RangePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="type"
          label={t('my.type', { defaultValue: 'Type' })}
          rules={[{ required: true }]}
        >
          <Select
            options={LEAVE_TYPES.map(type => ({
              value: type,
              label: t(`type.${type}`, { defaultValue: TYPE_LABELS[type] }),
            }))}
          />
        </Form.Item>
        <Form.Item name="reason" label={t('my.reason', { defaultValue: 'Reason (optional)' })}>
          <Input.TextArea rows={3} maxLength={500} showCount />
        </Form.Item>
      </Form>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {canEdit
          ? t('details.editHint', {
              defaultValue: 'Only work days are counted. Changes update the allowance immediately.',
            })
          : t('details.readOnlyHint', {
              defaultValue: 'Recorded leave can only be changed by an admin.',
            })}
      </Typography.Text>
    </Modal>
  );
};

interface LeaveDetailsEntry {
  id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  type: LeaveType | null;
}

interface LeaveDetailsModalProps {
  entry: LeaveDetailsEntry | null;
  onClose: () => void;
}

interface LeaveFormValues {
  range: [Dayjs, Dayjs];
  type: LeaveType;
  reason?: string;
}
