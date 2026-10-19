import HomeCalendar from '../../../components/calendars/homeCalendar/HomeCalendar';
import { useAppSelector } from '@/hooks/useAppSelector';
import { useEffect, useState } from 'react';
import { setHomeTasksConfig } from '@/features/home-page/home-page.slice';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import dayjs from 'dayjs';
import { Button } from '@/shared/antd-imports';
import { CalendarOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { TimeOffEntry } from '@/api/schedule/scheduleApi';
import { LeaveDetailsModal } from '@/components/leave/leave-details-modal';
import { RequestLeaveModal } from '@/components/leave/request-leave-modal';

const CalendarView = () => {
  const dispatch = useAppDispatch();
  const { homeTasksConfig } = useAppSelector(state => state.homePageReducer);
  const { t } = useTranslation('home');
  const [editingTimeOffEntry, setEditingTimeOffEntry] = useState<TimeOffEntry | null>(null);
  const [isRequestLeaveOpen, setIsRequestLeaveOpen] = useState(false);

  useEffect(() => {
    if (!homeTasksConfig.selected_date) {
      dispatch(
        setHomeTasksConfig({
          ...homeTasksConfig,
          selected_date: dayjs(),
        })
      );
    }
  }, [homeTasksConfig.selected_date, dispatch]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Button
        icon={<CalendarOutlined />}
        onClick={() => setIsRequestLeaveOpen(true)}
        style={{ marginBottom: 12, alignSelf: 'flex-start' }}
      >
        {t('tasks.markTimeOff', { defaultValue: 'Mark Time-Off / Leave' })}
      </Button>

      <HomeCalendar onTimeOffClick={setEditingTimeOffEntry} />

      <LeaveDetailsModal entry={editingTimeOffEntry} onClose={() => setEditingTimeOffEntry(null)} />

      <RequestLeaveModal open={isRequestLeaveOpen} onClose={() => setIsRequestLeaveOpen(false)} />
    </div>
  );
};

export default CalendarView;
