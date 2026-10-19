import { Tag } from '@/shared/antd-imports';
import { useTranslation } from 'react-i18next';
import { LeaveRequestStatus, LeaveType } from '@/types/leave/leave.types';

export const LeaveTypeTag = ({ type }: { type: LeaveType }) => {
  const { t } = useTranslation('leave');
  return (
    <Tag color={TYPE_COLORS[type]}>{t(`type.${type}`, { defaultValue: TYPE_LABELS[type] })}</Tag>
  );
};

export const LeaveStatusTag = ({ status }: { status: LeaveRequestStatus }) => {
  const { t } = useTranslation('leave');
  return (
    <Tag color={STATUS_COLORS[status]}>
      {t(`status.${status}`, { defaultValue: STATUS_LABELS[status] })}
    </Tag>
  );
};

export const LEAVE_TYPES: LeaveType[] = ['vacation', 'sick'];

export const TYPE_LABELS: Record<LeaveType, string> = {
  vacation: 'Vacation',
  sick: 'Sick leave',
};

const TYPE_COLORS: Record<LeaveType, string> = {
  vacation: 'blue',
  sick: 'orange',
};

const STATUS_LABELS: Record<LeaveRequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<LeaveRequestStatus, string> = {
  pending: 'gold',
  approved: 'green',
  rejected: 'red',
  cancelled: 'default',
};
