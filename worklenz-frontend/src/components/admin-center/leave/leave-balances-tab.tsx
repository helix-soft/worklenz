import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs, { Dayjs } from 'dayjs';
import { HistoryOutlined } from '@ant-design/icons';
import {
  Alert,
  Avatar,
  Button,
  DatePicker,
  DeleteOutlined,
  Drawer,
  EditOutlined,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  PlusOutlined,
  Popconfirm,
  Skeleton,
  Table,
  TableProps,
  Tooltip,
  Typography,
} from '@/shared/antd-imports';
import { leaveApiService } from '@/api/leave/leave.api.service';
import { ILeaveAdjustment, ILeaveBalance } from '@/types/leave/leave.types';
import logger from '@/utils/errorLogger';

export const LeaveBalancesTab = () => {
  const { t } = useTranslation('leave');
  const [year, setYear] = useState<Dayjs>(dayjs().startOf('year'));
  const [balances, setBalances] = useState<ILeaveBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [baseTarget, setBaseTarget] = useState<ILeaveBalance | null>(null);
  const [extraTarget, setExtraTarget] = useState<ILeaveBalance | null>(null);
  const [historyTarget, setHistoryTarget] = useState<ILeaveBalance | null>(null);

  const fetchBalances = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const res = await leaveApiService.getBalances(year.year());
      if (res.done) setBalances(res.body);
      else setHasError(true);
    } catch (error) {
      logger.error('Error fetching leave balances', error);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [year]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  const columns: TableProps<ILeaveBalance>['columns'] = useMemo(
    () => [
      {
        key: 'name',
        title: t('balances.columns.name', { defaultValue: 'Name' }),
        fixed: 'left',
        width: 220,
        render: (_, record) => (
          <Flex align="center" gap={8}>
            <Avatar size={28} src={record.avatar_url || undefined}>
              {record.name?.charAt(0)}
            </Avatar>
            <Typography.Text ellipsis>{record.name}</Typography.Text>
          </Flex>
        ),
      },
      {
        key: 'base_days',
        title: t('balances.columns.base', { defaultValue: 'Base' }),
        align: 'right',
        width: 120,
        render: (_, record) => (
          <Flex justify="flex-end" align="center" gap={4}>
            {record.base_days === null ? (
              <Typography.Text type="secondary">
                {t('balances.notSet', { defaultValue: 'Not set' })}
              </Typography.Text>
            ) : (
              <Tooltip
                title={
                  record.base_updated_by_name
                    ? t('balances.baseSetBy', {
                        defaultValue: 'Set by {{name}} on {{date}}',
                        name: record.base_updated_by_name,
                        date: dayjs(record.base_updated_at).format('YYYY-MM-DD'),
                      })
                    : undefined
                }
              >
                <span>{record.base_days}</span>
              </Tooltip>
            )}
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              aria-label={t('balances.editBase', { defaultValue: 'Edit base allowance' })}
              onClick={() => setBaseTarget(record)}
            />
          </Flex>
        ),
      },
      {
        key: 'extra_days',
        title: t('balances.columns.extra', { defaultValue: 'Extra' }),
        align: 'right',
        width: 120,
        render: (_, record) => (
          <Flex justify="flex-end" align="center" gap={4}>
            <span>{record.extra_days > 0 ? `+${record.extra_days}` : 0}</span>
            <Tooltip title={t('balances.history', { defaultValue: 'History' })}>
              <Button
                type="text"
                size="small"
                icon={<HistoryOutlined />}
                aria-label={t('balances.history', { defaultValue: 'History' })}
                onClick={() => setHistoryTarget(record)}
              />
            </Tooltip>
          </Flex>
        ),
      },
      {
        key: 'total_days',
        dataIndex: 'total_days',
        title: t('balances.columns.total', { defaultValue: 'Total' }),
        align: 'right',
        width: 90,
      },
      {
        key: 'used_days',
        dataIndex: 'used_days',
        title: t('balances.columns.used', { defaultValue: 'Used' }),
        align: 'right',
        width: 90,
      },
      {
        key: 'remaining_days',
        title: t('balances.columns.remaining', { defaultValue: 'Remaining' }),
        align: 'right',
        width: 110,
        render: (_, record) => (
          <Typography.Text strong type={record.remaining_days < 0 ? 'danger' : undefined}>
            {record.remaining_days}
          </Typography.Text>
        ),
      },
      {
        key: 'actions',
        align: 'right',
        width: 150,
        render: (_, record) => (
          <Button size="small" icon={<PlusOutlined />} onClick={() => setExtraTarget(record)}>
            {t('balances.addExtra', { defaultValue: 'Add days' })}
          </Button>
        ),
      },
    ],
    [t]
  );

  return (
    <Flex vertical gap={16}>
      <Flex align="center" gap={12} wrap="wrap">
        <DatePicker
          picker="year"
          allowClear={false}
          value={year}
          onChange={value => value && setYear(value.startOf('year'))}
          aria-label={t('balances.yearPicker', { defaultValue: 'Select year' })}
        />
        <Typography.Text type="secondary">
          {t('balances.hint', {
            defaultValue:
              "Vacation is deducted from the allowance. Carry over last year's remaining days by adding extra days.",
          })}
        </Typography.Text>
      </Flex>

      {hasError ? (
        <Alert
          type="error"
          showIcon
          message={t('loadError', { defaultValue: 'Could not load data.' })}
          action={
            <Button size="small" onClick={fetchBalances}>
              {t('retry', { defaultValue: 'Retry' })}
            </Button>
          }
        />
      ) : (
        <Table<ILeaveBalance>
          rowKey="team_member_id"
          size="middle"
          loading={isLoading}
          columns={columns}
          dataSource={balances}
          pagination={false}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: t('summary.empty', { defaultValue: 'No team members found.' }) }}
        />
      )}

      <BaseAllowanceModal
        target={baseTarget}
        year={year.year()}
        onClose={() => setBaseTarget(null)}
        onSaved={fetchBalances}
      />
      <ExtraDaysModal
        target={extraTarget}
        year={year.year()}
        onClose={() => setExtraTarget(null)}
        onSaved={fetchBalances}
      />
      <AdjustmentHistoryDrawer
        target={historyTarget}
        year={year.year()}
        onClose={() => setHistoryTarget(null)}
        onChanged={fetchBalances}
      />
    </Flex>
  );
};

const BaseAllowanceModal = ({ target, year, onClose, onSaved }: BalanceModalProps) => {
  const { t } = useTranslation('leave');
  const [form] = Form.useForm<{ base_days: number }>();
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (target) form.setFieldsValue({ base_days: target.base_days ?? 21 });
  }, [target, form]);

  const handleSubmit = async ({ base_days }: { base_days: number }) => {
    if (!target) return;
    setIsSaving(true);
    try {
      const res = await leaveApiService.setBaseAllowance(target.team_member_id, year, base_days);
      if (res.done) {
        onSaved();
        onClose();
      }
    } catch (error) {
      logger.error('Error saving base allowance', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      open={!!target}
      title={t('balances.baseModalTitle', {
        defaultValue: 'Base allowance for {{name}} ({{year}})',
        name: target?.name,
        year,
      })}
      okText={t('save', { defaultValue: 'Save' })}
      cancelText={t('cancel', { defaultValue: 'Cancel' })}
      confirmLoading={isSaving}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          name="base_days"
          label={t('balances.baseDaysLabel', { defaultValue: 'Leave days per year' })}
          rules={[
            {
              required: true,
              message: t('balances.baseDaysRequired', { defaultValue: 'Enter the number of days' }),
            },
          ]}
        >
          <InputNumber min={0} max={366} step={1} precision={0} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

/** Adds extra leave days, or edits an existing entry when `adjustment` is given. */
const ExtraDaysModal = ({
  target,
  year,
  adjustment,
  onClose,
  onSaved,
}: BalanceModalProps & { adjustment?: ILeaveAdjustment | null }) => {
  const { t } = useTranslation('leave');
  const [form] = Form.useForm<{ days: number; note: string }>();
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = !!adjustment;

  useEffect(() => {
    if (target) form.setFieldsValue({ days: adjustment?.days ?? 1, note: adjustment?.note ?? '' });
  }, [target, adjustment, form]);

  const handleSubmit = async ({ days, note }: { days: number; note: string }) => {
    if (!target) return;
    setIsSaving(true);
    try {
      const res = adjustment
        ? await leaveApiService.updateAdjustment(
            target.team_member_id,
            adjustment.id,
            days,
            note.trim()
          )
        : await leaveApiService.addAdjustment(target.team_member_id, year, days, note.trim());
      if (res.done) {
        onSaved();
        onClose();
      }
    } catch (error) {
      logger.error('Error adding extra leave days', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      open={!!target}
      title={
        isEditing
          ? t('balances.editExtraModalTitle', {
              defaultValue: 'Edit extra leave days of {{name}} ({{year}})',
              name: target?.name,
              year,
            })
          : t('balances.extraModalTitle', {
              defaultValue: 'Add extra leave days for {{name}} ({{year}})',
              name: target?.name,
              year,
            })
      }
      okText={
        isEditing
          ? t('save', { defaultValue: 'Save' })
          : t('balances.addExtra', { defaultValue: 'Add days' })
      }
      cancelText={t('cancel', { defaultValue: 'Cancel' })}
      confirmLoading={isSaving}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          name="days"
          label={t('balances.extraDaysLabel', { defaultValue: 'Number of days' })}
          rules={[
            {
              required: true,
              message: t('balances.baseDaysRequired', { defaultValue: 'Enter the number of days' }),
            },
          ]}
        >
          <InputNumber min={1} max={366} step={1} precision={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item
          name="note"
          label={t('balances.noteLabel', { defaultValue: 'Note' })}
          rules={[
            {
              required: true,
              whitespace: true,
              message: t('balances.noteRequired', {
                defaultValue: 'A note is required, e.g. why the day is granted',
              }),
            },
          ]}
        >
          <Input.TextArea
            rows={3}
            maxLength={500}
            showCount
            placeholder={t('balances.notePlaceholder', {
              defaultValue: 'e.g. Worked on a public holiday, so got one extra day off',
            })}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

const AdjustmentHistoryDrawer = ({
  target,
  year,
  onClose,
  onChanged,
}: {
  target: ILeaveBalance | null;
  year: number;
  onClose: () => void;
  onChanged: () => void;
}) => {
  const { t } = useTranslation('leave');
  const [items, setItems] = useState<ILeaveAdjustment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editing, setEditing] = useState<ILeaveAdjustment | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    if (!target) return;
    setIsLoading(true);
    try {
      const res = await leaveApiService.getAdjustments(target.team_member_id, year);
      setItems(res.done ? res.body : []);
    } catch (error) {
      logger.error('Error fetching leave adjustments', error);
    } finally {
      setIsLoading(false);
    }
  }, [target, year]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleDelete = async (item: ILeaveAdjustment) => {
    if (!target) return;
    setDeletingId(item.id);
    try {
      const res = await leaveApiService.deleteAdjustment(target.team_member_id, item.id);
      if (res.done) {
        fetchItems();
        onChanged();
      }
    } catch (error) {
      logger.error('Error deleting leave adjustment', error);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Drawer
      open={!!target}
      onClose={onClose}
      width={420}
      title={t('balances.historyTitle', {
        defaultValue: 'Extra days of {{name}} ({{year}})',
        name: target?.name,
        year,
      })}
    >
      {isLoading ? (
        <Skeleton active />
      ) : items.length === 0 ? (
        <Empty
          description={t('balances.noHistory', {
            defaultValue: 'No extra days were added this year.',
          })}
        />
      ) : (
        <List
          dataSource={items}
          renderItem={item => (
            <List.Item>
              <Flex vertical gap={4} style={{ width: '100%' }}>
                <Flex justify="space-between" align="center">
                  <Typography.Text strong>+{item.days}</Typography.Text>
                  <Flex align="center" gap={4}>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {dayjs(item.created_at).format('YYYY-MM-DD HH:mm')}
                    </Typography.Text>
                    <Tooltip title={t('edit', { defaultValue: 'Edit' })}>
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        aria-label={t('edit', { defaultValue: 'Edit' })}
                        onClick={() => setEditing(item)}
                      />
                    </Tooltip>
                    <Popconfirm
                      title={t('balances.deleteExtraConfirm', {
                        defaultValue:
                          'Delete these extra days? The allowance is reduced accordingly.',
                      })}
                      okText={t('delete', { defaultValue: 'Delete' })}
                      okButtonProps={{ danger: true }}
                      cancelText={t('cancel', { defaultValue: 'Cancel' })}
                      onConfirm={() => handleDelete(item)}
                    >
                      <Tooltip title={t('delete', { defaultValue: 'Delete' })}>
                        <Button
                          type="text"
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          loading={deletingId === item.id}
                          aria-label={t('delete', { defaultValue: 'Delete' })}
                        />
                      </Tooltip>
                    </Popconfirm>
                  </Flex>
                </Flex>
                <Typography.Text>{item.note}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {t('balances.addedBy', {
                    defaultValue: 'Added by {{name}}',
                    name: item.created_by_name || '—',
                  })}
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
      )}
      <ExtraDaysModal
        target={editing ? target : null}
        adjustment={editing}
        year={year}
        onClose={() => setEditing(null)}
        onSaved={() => {
          fetchItems();
          onChanged();
        }}
      />
    </Drawer>
  );
};

interface BalanceModalProps {
  target: ILeaveBalance | null;
  year: number;
  onClose: () => void;
  onSaved: () => void;
}
