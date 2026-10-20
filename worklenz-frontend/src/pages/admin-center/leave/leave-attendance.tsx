import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Alert, Card, Tabs } from '@/shared/antd-imports';
import WorklenzPageHeader from '@/components/common/WorklenzPageHeader';
import { useDocumentTitle } from '@/hooks/useDoumentTItle';
import { LeaveBalancesTab } from '@/components/admin-center/leave/leave-balances-tab';
import { LeaveRequestsTab } from '@/components/admin-center/leave/leave-requests-tab';

const LeaveAttendance = () => {
  const { t } = useTranslation('leave');
  useDocumentTitle(t('admin.title', { defaultValue: 'Leave & attendance' }));
  // Bumped after a request review so the balances tab re-fetches when opened again.
  const [balancesKey, setBalancesKey] = useState(0);

  return (
    <div style={{ width: '100%' }}>
      <WorklenzPageHeader
        title={t('admin.title', { defaultValue: 'Leave & attendance' })}
        subTitle={t('admin.subtitle', {
          defaultValue: 'Yearly leave allowances and leave requests.',
        })}
      />
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={
          <span>
            {t('admin.holidaysHint', {
              defaultValue: 'Official holidays are excluded from work days. Manage them in',
            })}{' '}
            <Link to="/worklenz/admin-center/settings">
              {t('admin.holidaysLink', { defaultValue: 'Admin Center settings' })}
            </Link>
            {'. '}
            {t('admin.attendanceMoved', {
              defaultValue: 'The monthly attendance summary is now under',
            })}{' '}
            <Link to="/worklenz/reporting/time-sheet-attendance">
              {t('admin.attendanceLink', { defaultValue: 'Reporting → Attendance' })}
            </Link>
          </span>
        }
      />
      <Card>
        <Tabs
          destroyOnHidden
          items={[
            {
              key: 'balances',
              label: t('admin.tabs.balances', { defaultValue: 'Leave allowances' }),
              children: <LeaveBalancesTab key={balancesKey} />,
            },
            {
              key: 'requests',
              label: t('admin.tabs.requests', { defaultValue: 'Leave requests' }),
              children: <LeaveRequestsTab onReviewed={() => setBalancesKey(k => k + 1)} />,
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default LeaveAttendance;
