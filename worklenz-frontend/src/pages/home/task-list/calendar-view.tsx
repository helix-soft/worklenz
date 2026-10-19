import HomeCalendar from '../../../components/calendars/homeCalendar/HomeCalendar';
import { Tag, Typography, Button } from '@/shared/antd-imports';
import { ClockCircleOutlined, CalendarOutlined } from '@ant-design/icons';
import { useAppSelector } from '@/hooks/useAppSelector';
import AddTaskInlineForm from './add-task-inline-form';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { setHomeTasksConfig } from '@/features/home-page/home-page.slice';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import dayjs from 'dayjs';
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
    <div>
      <Button
        icon={<CalendarOutlined />}
        onClick={() => setIsRequestLeaveOpen(true)}
        style={{ marginBottom: 12 }}
      >
        {t('tasks.markTimeOff', { defaultValue: 'Mark Time-Off / Leave' })}
      </Button>

      <HomeCalendar onTimeOffClick={setEditingTimeOffEntry} />

      <Tag
        icon={<ClockCircleOutlined style={{ fontSize: 16 }} />}
        color="success"
        style={{
          display: 'flex',
          width: '100%',
          padding: '8px 12px',
          marginBlock: 12,
        }}
      >
        <Typography.Text>
          {t('home:tasks.dueOn')} {homeTasksConfig.selected_date?.format('MMM DD, YYYY')}
        </Typography.Text>
      </Tag>

      <AddTaskInlineForm t={t} calendarView={true} />

      <LeaveDetailsModal entry={editingTimeOffEntry} onClose={() => setEditingTimeOffEntry(null)} />

      <RequestLeaveModal open={isRequestLeaveOpen} onClose={() => setIsRequestLeaveOpen(false)} />
    </div>
  );
};

export default CalendarView;
