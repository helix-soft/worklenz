import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dayjs } from 'dayjs';
import { DatePicker, Form, Input, Modal, Select, Typography } from '@/shared/antd-imports';
import { leaveApiService } from '@/api/leave/leave.api.service';
import { LeaveType } from '@/types/leave/leave.types';
import { LEAVE_TYPES, TYPE_LABELS } from '@/components/leave/leave-tags';
import logger from '@/utils/errorLogger';

/**
 * "Request leave" dialog: submits a leave request for the current member, which an Owner/Admin
 * then approves. Shared by Settings → My leave, the Home calendar and the navbar quick action.
 */
export const RequestLeaveModal = ({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) => {
  const { t } = useTranslation('leave');
  const [form] = Form.useForm<RequestFormValues>();
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (values: RequestFormValues) => {
    setIsSaving(true);
    try {
      const [start, end] = values.range;
      const res = await leaveApiService.createRequest({
        start_date: start.format('YYYY-MM-DD'),
        end_date: end.format('YYYY-MM-DD'),
        type: values.type,
        reason: values.reason?.trim() || undefined,
      });
      if (res.done) {
        form.resetFields();
        onCreated?.();
        onClose();
      }
    } catch (error) {
      logger.error('Error creating leave request', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('my.requestLeave', { defaultValue: 'Request leave' })}
      okText={t('my.submitRequest', { defaultValue: 'Submit request' })}
      cancelText={t('cancel', { defaultValue: 'Cancel' })}
      confirmLoading={isSaving}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ type: 'vacation' }}
        onFinish={handleSubmit}
        preserve={false}
      >
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
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('my.requestHint', {
            defaultValue:
              'Only work days are counted. Vacation is deducted from your allowance once approved.',
          })}
        </Typography.Text>
      </Form>
    </Modal>
  );
};

interface RequestFormValues {
  range: [Dayjs, Dayjs];
  type: LeaveType;
  reason?: string;
}
