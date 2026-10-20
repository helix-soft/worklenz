import { useMemo, useState, useCallback, useEffect } from 'react';
import dayjs, { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Typography,
  Popover,
  Tooltip,
  LeftOutlined,
  RightOutlined,
} from '@/shared/antd-imports';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import { useAppSelector } from '@/hooks/useAppSelector';
import { useAuthService } from '@/hooks/useAuth';
import {
  useGetTasksByDateRangeQuery,
  useGetProjectsByTeamQuery,
  useGetClientsLookupQuery,
} from '@/api/home-page/home-page.api.service';
import { useFetchTimeOffQuery, TimeOffEntry } from '@/api/schedule/scheduleApi';
import { leaveApiService } from '@/api/leave/leave.api.service';
import { ICalendarHoliday } from '@/types/leave/leave.types';
import logger from '@/utils/errorLogger';
import { setHomeTasksConfig } from '@/features/home-page/home-page.slice';
import {
  setSelectedTaskId,
  setShowTaskDrawer,
  fetchTask,
} from '@/features/task-drawer/task-drawer.slice';
import { setProjectId } from '@/features/project/project.slice';
import { IHomeCalendarTask } from '@/types/home/home-page.types';
import HomeAddTaskModal from '@/pages/home/task-list/HomeAddTaskModal';
import MultiSelectFilterDropdown from './MultiSelectFilterDropdown';
import { useNavigate } from 'react-router-dom';
import { SyncOutlined } from '@ant-design/icons';
import { IGoogleCalendarEvent } from '@/types/google-calendar.types';
import { getCalendarColor, useGoogleCalendarEvents } from './useGoogleCalendarEvents';
import { WeekTimeGrid } from './WeekTimeGrid';
import { AgendaView } from './AgendaView';
import { GoogleEventDetailsModal } from './GoogleEventDetailsModal';
import './homeCalendar.css';

dayjs.extend(isoWeek);

type CalendarViewType = 'month' | 'week' | 'year' | 'agenda';

/** Google events shown per day cell in Week/Month before collapsing into "+N". */
const MAX_EVENT_PILLS = 2;

// Matches the status-category colors used by HomeProgressDonut so the calendar's
// todo/doing/done counts read consistently with the rest of the Home page.
const STATUS_CATEGORY_COLORS = { todo: '#faad14', doing: '#1677ff', done: '#52c41a' };

interface HomeCalendarProps {
  onTimeOffClick?: (entry: TimeOffEntry) => void;
}

const HomeCalendar: React.FC<HomeCalendarProps> = ({ onTimeOffClick }) => {
  const { t } = useTranslation('home');
  const dispatch = useAppDispatch();
  const currentSession = useAuthService().getCurrentSession();
  const { homeTasksConfig } = useAppSelector(state => state.homePageReducer);
  const themeMode = useAppSelector(state => state.themeReducer.mode);
  const isDarkMode = themeMode === 'dark';

  const WEEK_DAY_LABELS = useMemo(
    () => [
      t('homeCalendar.weekdayMon', { defaultValue: 'Mon' }),
      t('homeCalendar.weekdayTue', { defaultValue: 'Tue' }),
      t('homeCalendar.weekdayWed', { defaultValue: 'Wed' }),
      t('homeCalendar.weekdayThu', { defaultValue: 'Thu' }),
      t('homeCalendar.weekdayFri', { defaultValue: 'Fri' }),
      t('homeCalendar.weekdaySat', { defaultValue: 'Sat' }),
      t('homeCalendar.weekdaySun', { defaultValue: 'Sun' }),
    ],
    [t]
  );

  const MINI_WEEK_DAY_LABELS = useMemo(
    () => [
      t('homeCalendar.weekdayMiniMon', { defaultValue: 'M' }),
      t('homeCalendar.weekdayMiniTue', { defaultValue: 'T' }),
      t('homeCalendar.weekdayMiniWed', { defaultValue: 'W' }),
      t('homeCalendar.weekdayMiniThu', { defaultValue: 'T' }),
      t('homeCalendar.weekdayMiniFri', { defaultValue: 'F' }),
      t('homeCalendar.weekdayMiniSat', { defaultValue: 'S' }),
      t('homeCalendar.weekdayMiniSun', { defaultValue: 'S' }),
    ],
    [t]
  );

  const [calView, setCalView] = useState<CalendarViewType>('agenda');
  const [cursor, setCursor] = useState<Dayjs>(() => homeTasksConfig.selected_date || dayjs());
  const [filterClients, setFilterClients] = useState<string[]>([]);
  const [filterProjects, setFilterProjects] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState<Dayjs | null>(null);

  const rangeStart = useMemo(() => {
    if (calView === 'year') return cursor.startOf('year');
    if (calView === 'week' || calView === 'agenda') return cursor.startOf('isoWeek');
    return cursor.startOf('month').startOf('isoWeek');
  }, [calView, cursor]);

  const rangeEnd = useMemo(() => {
    if (calView === 'year') return cursor.endOf('year');
    if (calView === 'week' || calView === 'agenda') return cursor.endOf('isoWeek');
    return cursor.endOf('month').endOf('isoWeek');
  }, [calView, cursor]);

  const { data: tasksData } = useGetTasksByDateRangeQuery(
    {
      start_date: rangeStart.format('YYYY-MM-DD'),
      end_date: rangeEnd.format('YYYY-MM-DD'),
      // The calendar always shows the tasks assigned to me.
      group_by: 0,
      time_zone: homeTasksConfig.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    { refetchOnMountOrArgChange: true }
  );

  const allTasks = tasksData?.body || [];

  const { data: timeOffData } = useFetchTimeOffQuery(
    {
      teamMemberId: currentSession?.team_member_id || '',
      startDate: rangeStart.format('YYYY-MM-DD'),
      endDate: rangeEnd.format('YYYY-MM-DD'),
    },
    { skip: !currentSession?.team_member_id, refetchOnMountOrArgChange: true }
  );

  const timeOffEntries = useMemo(() => timeOffData?.body || [], [timeOffData]);

  const timeOffByDate = useMemo(() => {
    const map = new Map<string, TimeOffEntry[]>();
    timeOffEntries.forEach(entry => {
      let cur = dayjs(entry.start_date);
      const end = dayjs(entry.end_date);
      while (cur.isBefore(end) || cur.isSame(end, 'day')) {
        const key = cur.format('YYYY-MM-DD');
        const list = map.get(key) || [];
        list.push(entry);
        map.set(key, list);
        cur = cur.add(1, 'day');
      }
    });
    return map;
  }, [timeOffEntries]);

  // Official (country) and custom company holidays, highlighted in every view.
  const [holidays, setHolidays] = useState<ICalendarHoliday[]>([]);
  useEffect(() => {
    let isCancelled = false;
    leaveApiService
      .getHolidays(rangeStart.format('YYYY-MM-DD'), rangeEnd.format('YYYY-MM-DD'))
      .then(res => {
        if (!isCancelled) setHolidays(res.done ? res.body : []);
      })
      .catch(error => logger.error('Error fetching holidays for calendar', error));
    return () => {
      isCancelled = true;
    };
  }, [rangeStart, rangeEnd]);

  const holidaysByDate = useMemo(() => {
    const map = new Map<string, ICalendarHoliday[]>();
    holidays.forEach(holiday => map.set(holiday.date, [...(map.get(holiday.date) || []), holiday]));
    return map;
  }, [holidays]);

  const renderHolidayPills = useCallback(
    (date: Dayjs) => {
      const entries = holidaysByDate.get(date.format('YYYY-MM-DD'));
      if (!entries?.length) return null;
      return (
        <div className="home-calendar__indicators" onClick={e => e.stopPropagation()}>
          {entries.map(holiday => {
            const kind =
              holiday.source === 'official'
                ? t('homeCalendar.officialHoliday', { defaultValue: 'Official holiday' })
                : t('homeCalendar.companyHoliday', { defaultValue: 'Company holiday' });
            return (
              <Tooltip key={`${holiday.date}-${holiday.name}`} title={`${kind}: ${holiday.name}`}>
                <span className="home-calendar__holiday-pill">{holiday.name}</span>
              </Tooltip>
            );
          })}
        </div>
      );
    },
    [holidaysByDate, t]
  );

  // Read-only Google Calendar events of the current user (Settings → Integrations).
  const navigate = useNavigate();
  const {
    status: googleStatus,
    eventsByDate: googleEventsByDate,
    isSyncing: isGoogleSyncing,
    sync: syncGoogleCalendar,
  } = useGoogleCalendarEvents(rangeStart, rangeEnd);
  const [selectedGoogleEvent, setSelectedGoogleEvent] = useState<IGoogleCalendarEvent | null>(null);

  const renderGoogleEventPills = useCallback(
    (date: Dayjs) => {
      const events = googleEventsByDate.get(date.format('YYYY-MM-DD'));
      if (!events?.length) return null;
      const visible = events.slice(0, MAX_EVENT_PILLS);
      const hidden = events.length - visible.length;
      return (
        <div className="home-calendar__gcal-list" onClick={e => e.stopPropagation()}>
          {visible.map(event => {
            const time = event.is_all_day ? '' : `${dayjs(event.start_at).format('HH:mm')} `;
            const title = event.title || t('homeCalendar.google.untitled', { defaultValue: '(No title)' });
            return (
              <Tooltip key={event.id} title={`${time}${title}`}>
                <button
                  type="button"
                  className="home-calendar__gcal-pill"
                  style={{
                    background: `color-mix(in srgb, ${getCalendarColor(event)} ${isDarkMode ? 30 : 18}%, ${isDarkMode ? '#1d1d1d' : '#ffffff'})`,
                    borderLeft: `3px solid ${getCalendarColor(event)}`,
                    color: 'inherit',
                  }}
                  onClick={() => setSelectedGoogleEvent(event)}
                >
                  {time}
                  {title}
                </button>
              </Tooltip>
            );
          })}
          {hidden > 0 && (
            <button
              type="button"
              className="home-calendar__gcal-more"
              onClick={() => {
                setCursor(date);
                setCalView('agenda');
              }}
            >
              {t('homeCalendar.google.more', { defaultValue: '+{{count}} more', count: hidden })}
            </button>
          )}
        </div>
      );
    },
    [googleEventsByDate, t, isDarkMode]
  );

  // Team-scoped project list — independent of which tasks are currently
  // loaded, so projects with no due tasks in the visible range still show up.
  const { data: teamProjectsData, isFetching: projectsLoading } = useGetProjectsByTeamQuery();

  // Team-scoped client list — independent of which tasks are currently
  // loaded, so clients with no due tasks in the visible range still show up.
  const { data: clientsLookupData, isFetching: clientsLoading } = useGetClientsLookupQuery();

  const clientOptions = useMemo(() => {
    return (clientsLookupData?.body || [])
      .filter(client => client.id && client.name)
      .map(client => ({ value: client.id as string, label: client.name as string }));
  }, [clientsLookupData]);

  const projectOptions = useMemo(() => {
    return (teamProjectsData?.body || [])
      .filter(project => project.id && project.name)
      .map(project => ({
        value: project.id as string,
        label: project.name as string,
        color: project.color_code,
      }));
  }, [teamProjectsData]);

  const anyFilterActive = filterClients.length > 0 || filterProjects.length > 0;

  const filteredTasks = useMemo(() => {
    return allTasks.filter(task => {
      if (filterClients.length && !filterClients.includes(task.client_id || '')) return false;
      if (filterProjects.length && !filterProjects.includes(task.project_id || '')) return false;
      return true;
    });
  }, [allTasks, filterClients, filterProjects]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, IHomeCalendarTask[]>();
    filteredTasks.forEach(task => {
      if (!task.end_date) return;
      const key = dayjs(task.end_date).format('YYYY-MM-DD');
      const existing = map.get(key) || [];
      existing.push(task);
      map.set(key, existing);
    });
    return map;
  }, [filteredTasks]);

  const clearFilters = () => {
    setFilterClients([]);
    setFilterProjects([]);
  };

  const goToday = () => setCursor(dayjs());
  const stepUnit = calView === 'agenda' ? 'week' : calView;
  const goPrev = () => setCursor(c => c.subtract(1, stepUnit));
  const goNext = () => setCursor(c => c.add(1, stepUnit));

  const openAddModal = useCallback((date: Dayjs) => {
    setModalDate(date);
    setModalOpen(true);
  }, []);

  const openTaskDrawer = useCallback(
    (task: IHomeCalendarTask) => {
      dispatch(setSelectedTaskId(task.id));
      dispatch(fetchTask({ taskId: task.id, projectId: task.project_id }));
      dispatch(setProjectId(task.project_id));
      dispatch(setShowTaskDrawer(true));
    },
    [dispatch]
  );

  const handleSelectDate = (date: Dayjs) => {
    dispatch(setHomeTasksConfig({ ...homeTasksConfig, selected_date: date }));
  };


  const renderDaySummary = useCallback(
    (dayTasks: IHomeCalendarTask[], date: Dayjs) => {
      if (!dayTasks.length) return null;
      const todoTasks = dayTasks.filter(task => task.is_todo);
      const doingTasks = dayTasks.filter(task => task.is_doing);
      const doneTasks = dayTasks.filter(task => task.is_completed);

      const renderTaskList = (tasks: IHomeCalendarTask[]) => (
        <div className="home-calendar-day-popover-list">
          {tasks.map(task => (
            <div
              key={task.id}
              className="home-calendar-day-popover-item"
              onClick={e => {
                e.stopPropagation();
                openTaskDrawer(task);
              }}
            >
              <span
                className="home-calendar-day-popover-item-dot"
                style={{ backgroundColor: task.status_color || '#8c8c8c' }}
              />
              <span className="home-calendar-day-popover-item-name">{task.name}</span>
              {task.project_name && (
                <span className="home-calendar-day-popover-item-project">{task.project_name}</span>
              )}
            </div>
          ))}
        </div>
      );

      const renderSegment = (
        key: string,
        label: string,
        tasks: IHomeCalendarTask[],
        className: string,
        popoverTitle: string,
        style?: React.CSSProperties
      ) => (
        <Popover
          key={key}
          content={renderTaskList(tasks)}
          title={popoverTitle}
          trigger="hover"
          placement="bottom"
          mouseEnterDelay={0.2}
        >
          <span className={className} style={style} onClick={e => e.stopPropagation()}>
            {label} {tasks.length}
          </span>
        </Popover>
      );

      // The status breakdown only adds information when the day's tasks are in 2+ categories;
      // with a single category it would just repeat the total.
      const hasBreakdown =
        [todoTasks, doingTasks, doneTasks].filter(list => list.length > 0).length > 1;

      const dueTaskWord = (count: number) =>
        count === 1
          ? t('tasks.dueTask', { defaultValue: 'due task' })
          : t('tasks.dueTasks', { defaultValue: 'due tasks' });

      const todoLabel = t('tasks.todo', { defaultValue: 'Todo' });
      const doingLabel = t('tasks.doing', { defaultValue: 'Doing' });
      const doneLabel = t('tasks.done', { defaultValue: 'Done' });

      const totalDueTitle = `${t('tasks.total', { defaultValue: 'Total' })}: ${dayTasks.length} ${dueTaskWord(
        dayTasks.length
      )} ${t('tasks.on', { defaultValue: 'on' })} ${date.format('MMM D')}`;

      return (
        <div className="home-calendar-day-summary">
          <div className="home-calendar-day-summary-row">
            {renderSegment(
              'total',
              t('tasks.totalDue', { defaultValue: 'Total due' }),
              dayTasks,
              'home-calendar-day-summary-total',
              totalDueTitle
            )}
          </div>
          {hasBreakdown && (
            <div className="home-calendar-day-summary-row">
              {todoTasks.length > 0 &&
                renderSegment(
                  'todo',
                  todoLabel,
                  todoTasks,
                  'home-calendar-day-summary-segment',
                  `${todoLabel}: ${todoTasks.length} ${dueTaskWord(todoTasks.length)}`,
                  { color: STATUS_CATEGORY_COLORS.todo }
                )}
              {doingTasks.length > 0 &&
                renderSegment(
                  'doing',
                  doingLabel,
                  doingTasks,
                  'home-calendar-day-summary-segment',
                  `${doingLabel}: ${doingTasks.length} ${dueTaskWord(doingTasks.length)}`,
                  { color: STATUS_CATEGORY_COLORS.doing }
                )}
              {doneTasks.length > 0 &&
                renderSegment(
                  'done',
                  doneLabel,
                  doneTasks,
                  'home-calendar-day-summary-segment',
                  `${doneLabel}: ${doneTasks.length} ${dueTaskWord(doneTasks.length)}`,
                  { color: STATUS_CATEGORY_COLORS.done }
                )}
            </div>
          )}
        </div>
      );
    },
    [openTaskDrawer, t]
  );

  const renderTimeOffPill = useCallback(
    (date: Dayjs) => {
      const dateKey = date.format('YYYY-MM-DD');
      const entries = timeOffByDate.get(dateKey);
      if (!entries || entries.length === 0) return null;

      return (
        <div className="home-calendar__indicators" onClick={e => e.stopPropagation()}>
          {entries.map(entry => {
            const typeLabel = entry.type
              ? t(`timeOff.types.${entry.type}`, { defaultValue: entry.type })
              : '';
            const text =
              entry.is_full_day === false && entry.hours_off
                ? `${entry.hours_off}h ${t('timeOff.off', { defaultValue: 'off' })}`
                : t('timeOff.timeOff', { defaultValue: 'Time Off' });
            const fullLabel = typeLabel ? `${text} (${typeLabel})` : text;

            return (
              <Tooltip
                key={entry.id}
                title={entry.reason ? `${fullLabel}: ${entry.reason}` : fullLabel}
              >
                <span
                  className="home-calendar__time-off-pill"
                  onClick={e => {
                    e.stopPropagation();
                    onTimeOffClick?.(entry);
                  }}
                >
                  {fullLabel}
                </span>
              </Tooltip>
            );
          })}
        </div>
      );
    },
    [timeOffByDate, onTimeOffClick, t]
  );

  const navTitle =
    calView === 'year'
      ? cursor.format('YYYY')
      : calView === 'week' || calView === 'agenda'
        ? `${rangeStart.format('MMM D')} – ${rangeEnd.format('MMM D, YYYY')}`
        : cursor.format('MMMM YYYY');

  /* ── Month view ── */
  const renderMonth = () => {
    const start = cursor.startOf('month').startOf('isoWeek');
    const end = cursor.endOf('month').endOf('isoWeek');
    const days: Dayjs[] = [];
    let d = start;
    while (d.isBefore(end) || d.isSame(end, 'day')) {
      days.push(d);
      d = d.add(1, 'day');
    }
    const weeks: Dayjs[][] = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

    return (
      <div className="home-calendar-grid">
        <div className="home-calendar-weekday-row">
          {WEEK_DAY_LABELS.map((label, i) => (
            <div key={i} className="home-calendar-weekday-cell">
              {label}
            </div>
          ))}
        </div>
        <div className="home-calendar-month-body">
          {weeks.map((week, wi) => (
            <div key={wi} className="home-calendar-week-row">
              {week.map(date => {
                const inMonth = date.isSame(cursor, 'month');
                const isToday = date.isSame(dayjs(), 'day');
                const dateKey = date.format('YYYY-MM-DD');
                const dayTasks = tasksByDate.get(dateKey) || [];
                const isHoliday = holidaysByDate.has(dateKey);
                return (
                  <div
                    key={dateKey}
                    className={`home-calendar-day-cell ${inMonth ? '' : 'home-calendar-day-cell-muted'} ${isHoliday ? 'home-calendar-day-cell-holiday' : ''}`}
                    onClick={() => {
                      handleSelectDate(date);
                      openAddModal(date);
                    }}
                  >
                    <div className="home-calendar-day-header">
                      <span
                        className={`home-calendar-day-number ${isToday ? 'home-calendar-day-number-today' : ''}`}
                      >
                        {date.date()}
                      </span>
                      <span className="home-calendar-day-add-hint">
                        {t('homeCalendar.addHint', { defaultValue: '+ Add' })}
                      </span>
                    </div>
                    {renderHolidayPills(date)}
                    {renderTimeOffPill(date)}
                    {renderGoogleEventPills(date)}
                    <div className="home-calendar-day-tasks">
                      {renderDaySummary(dayTasks, date)}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  /* ── Week view: hour grid with events, tasks, time off and holidays ── */
  const renderWeek = () => (
    <WeekTimeGrid
      days={Array.from({ length: 7 }, (_, i) => cursor.startOf('isoWeek').add(i, 'day'))}
      eventsByDate={googleEventsByDate}
      tasksByDate={tasksByDate}
      timeOffByDate={timeOffByDate}
      holidaysByDate={holidaysByDate}
      onOpenEvent={setSelectedGoogleEvent}
      onOpenTask={openTaskDrawer}
      onOpenTimeOff={onTimeOffClick}
    />
  );

  /* ── Year view ── */
  const renderYear = () => {
    const months = Array.from({ length: 12 }, (_, i) => cursor.startOf('year').month(i));
    return (
      <div className="home-calendar-year-grid">
        {months.map(monthStart => {
          const isCurMonth = monthStart.isSame(dayjs(), 'month');
          const start = monthStart.startOf('month').startOf('isoWeek');
          const end = monthStart.endOf('month').endOf('isoWeek');
          const days: Dayjs[] = [];
          let d = start;
          while (d.isBefore(end) || d.isSame(end, 'day')) {
            days.push(d);
            d = d.add(1, 'day');
          }
          return (
            <div
              key={monthStart.format('YYYY-MM')}
              className="home-calendar-mini-month"
              onClick={() => {
                setCursor(monthStart);
                setCalView('month');
              }}
            >
              <div
                className={`home-calendar-mini-month-title ${isCurMonth ? 'home-calendar-mini-month-title-active' : ''}`}
              >
                {monthStart.format('MMMM YYYY')}
              </div>
              <div className="home-calendar-mini-month-weekdays">
                {MINI_WEEK_DAY_LABELS.map((label, i) => (
                  <span key={i}>{label}</span>
                ))}
              </div>
              <div className="home-calendar-mini-month-grid">
                {days.map(date => {
                  const inMonth = date.isSame(monthStart, 'month');
                  const isToday = date.isSame(dayjs(), 'day');
                  const dayHolidays = inMonth
                    ? holidaysByDate.get(date.format('YYYY-MM-DD'))
                    : undefined;
                  return (
                    <span
                      key={date.format('YYYY-MM-DD')}
                      title={dayHolidays?.map(h => h.name).join(', ')}
                      className={`home-calendar-mini-day ${inMonth ? '' : 'home-calendar-mini-day-muted'} ${isToday ? 'home-calendar-mini-day-today' : ''} ${dayHolidays ? 'home-calendar-mini-day-holiday' : ''}`}
                    >
                      {date.date()}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`home-calendar-root ${isDarkMode ? 'home-calendar-dark' : ''}`}>
      <div className="home-calendar-toolbar">
        <div className="home-calendar-view-toggle">
          {(['agenda', 'week', 'month', 'year'] as CalendarViewType[]).map(view => (
            <button
              key={view}
              type="button"
              className={`home-calendar-view-toggle-btn ${calView === view ? 'home-calendar-view-toggle-btn-active' : ''}`}
              onClick={() => setCalView(view)}
            >
              {view === 'week'
                ? t('homeCalendar.weekView', { defaultValue: 'Week' })
                : view === 'month'
                  ? t('homeCalendar.monthView', { defaultValue: 'Month' })
                  : view === 'year'
                    ? t('homeCalendar.yearView', { defaultValue: 'Year' })
                    : t('homeCalendar.agendaView', { defaultValue: 'Agenda' })}
            </button>
          ))}
        </div>
        <Button size="small" onClick={goToday}>
          {t('homeCalendar.todayButton', { defaultValue: 'Today' })}
        </Button>
        <Button size="small" icon={<LeftOutlined />} onClick={goPrev} />
        <Typography.Text strong className="home-calendar-title">
          {navTitle}
        </Typography.Text>
        <Button size="small" icon={<RightOutlined />} onClick={goNext} />

        {googleStatus?.connected ? (
          <Tooltip
            title={
              googleStatus.status === 'needs_reauth'
                ? t('homeCalendar.google.needsReconnect', {
                    defaultValue: 'Google Calendar needs to be reconnected in Settings → Integrations',
                  })
                : googleStatus.last_synced_at
                  ? t('homeCalendar.google.lastSynced', {
                      defaultValue: 'Last synced {{date}}',
                      date: dayjs(googleStatus.last_synced_at).format('YYYY-MM-DD HH:mm'),
                    })
                  : undefined
            }
          >
            <Button
              size="small"
              icon={<SyncOutlined />}
              loading={isGoogleSyncing}
              disabled={googleStatus.status === 'needs_reauth'}
              onClick={() => void syncGoogleCalendar()}
            >
              {t('homeCalendar.google.sync', { defaultValue: 'Sync calendar' })}
            </Button>
          </Tooltip>
        ) : (
          googleStatus?.configured && (
            <Button type="link" size="small" onClick={() => navigate('/worklenz/settings/integrations')}>
              {t('homeCalendar.google.connect', { defaultValue: 'Connect Google Calendar' })}
            </Button>
          )
        )}

        <div className="home-calendar-toolbar-spacer" />

        <MultiSelectFilterDropdown
          label={t('homeCalendar.clientsPlaceholder', { defaultValue: 'All Clients' })}
          searchPlaceholder={t('homeCalendar.clientsSearchPlaceholder', {
            defaultValue: 'Search clients...',
          })}
          options={clientOptions}
          selected={filterClients}
          onChange={setFilterClients}
          loading={clientsLoading}
        />
        <MultiSelectFilterDropdown
          label={t('homeCalendar.projectsPlaceholder', { defaultValue: 'All Projects' })}
          searchPlaceholder={t('homeCalendar.projectsSearchPlaceholder', {
            defaultValue: 'Search projects...',
          })}
          options={projectOptions}
          selected={filterProjects}
          onChange={setFilterProjects}
          loading={projectsLoading}
        />
        {anyFilterActive && (
          <Button type="link" size="small" onClick={clearFilters}>
            {t('homeCalendar.clearFilters', { defaultValue: 'Clear' })}
          </Button>
        )}
      </div>

      {calView === 'month' && renderMonth()}
      {calView === 'week' && renderWeek()}
      {calView === 'year' && renderYear()}
      {calView === 'agenda' && (
        <AgendaView
          days={Array.from({ length: 7 }, (_, i) => rangeStart.add(i, 'day'))}
          eventsByDate={googleEventsByDate}
          tasksByDate={tasksByDate}
          timeOffByDate={timeOffByDate}
          holidaysByDate={holidaysByDate}
          onOpenEvent={setSelectedGoogleEvent}
          onOpenTask={openTaskDrawer}
          onOpenTimeOff={onTimeOffClick}
        />
      )}

      <GoogleEventDetailsModal event={selectedGoogleEvent} onClose={() => setSelectedGoogleEvent(null)} />

      <HomeAddTaskModal
        open={modalOpen}
        defaultDate={modalDate}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
};

export default HomeCalendar;
