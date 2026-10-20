import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Select,
  DatePicker,
  InputRef,
  Segmented,
  Input,
  Button,
  theme,
  notification,
  Table,
  TableProps,
  Badge,
  Pagination,
  CaretUpOutlined,
  CaretDownOutlined,
  Tag,
  Alert,
} from '@/shared/antd-imports';
import dayjs, { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '@/hooks/useAppSelector';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import { useGetProjectsByTeamQuery } from '@/api/home-page/home-page.api.service';
import {
  taskTimeLogsApiService,
  IRecentTimeLog,
  ITaskInProject,
} from '@/api/tasks/task-time-logs.api.service';
import { IProject } from '@/types/project/project.types';
import HomeAddTaskModal from '../task-list/HomeAddTaskModal';
import {
  setSelectedTaskId,
  setShowTaskDrawer,
  fetchTask,
  setNavigationContext,
  setTargetDrawerTab,
} from '@/features/task-drawer/task-drawer.slice';
import { setProjectId } from '@/features/project/project.slice';
import { updateTask } from '@/features/task-management/task-management.slice';
import { Task } from '@/types/task-management.types';
import { fetchPriorities } from '@/features/taskAttributes/taskPrioritySlice';
import { useSocket } from '@/socket/socketContext';
import { SocketEvents } from '@/shared/socket-events';
import { decodeHtmlEntities } from '@/utils/html-entities';
import { toSolidTagColor } from '@/utils/colorUtils';
import { useResponsive } from '@/hooks/useResponsive';
import { store } from '@/app/store';
import { ITaskListStatusChangeResponse } from '@/types/tasks/task-list-status.types';
import { ITaskListPriorityChangeResponse } from '@/types/tasks/task-list-priority.types';
import { ITaskPriority } from '@/types/tasks/taskPriority.types';
import { ITaskStatus } from '@/types/tasks/taskStatus.types';
import { TruncatedColoredTag } from '@/components/common/truncated-colored-tag/TruncatedColoredTag';
import { TimeTextInput } from '@/components/common/time-text-input/TimeTextInput';
import { getTimeRangeSeconds } from '@/utils/time-text-input';
import { DEFAULT_TIME_LOG_ACTIVITY, TimeLogActivity } from '@/shared/time-log-activities';
import { TimeLogActivitySelect } from '@/components/time-entries/TimeLogActivitySelect';
import { TimeRangeDurationHint } from '@/components/time-entries/TimeRangeDurationHint';
import {
  IWeekGhostEvent,
  MyWeekCalendar,
  ResizeEntryHandler,
} from '@/components/time-entries/week-calendar/MyWeekCalendar';
import {
  getCalendarColor,
  useGoogleCalendarEvents,
} from '@/components/calendars/homeCalendar/useGoogleCalendarEvents';
import { useMyWeekTimeLogs } from '@/components/time-entries/week-calendar/useMyWeekTimeLogs';
import { getWeekStart, IWeekCalendarEntry } from '@/utils/week-calendar';
import './home-log-time.css';

const patchRecentLogsForTask = (
  setRecentLogs: React.Dispatch<React.SetStateAction<IRecentTimeLog[]>>,
  taskId: string,
  patch: Partial<IRecentTimeLog>
) => {
  setRecentLogs(prevLogs =>
    prevLogs.map(log => (log.task_id === taskId ? { ...log, ...patch } : log))
  );
};

const resolveStatusFields = (
  statusId: string | undefined,
  statuses: ITaskStatus[] | undefined,
  colorCode?: string,
  colorCodeDark?: string,
  isDone?: boolean,
  // The socket payload carries the status name; the cache lookup is only a
  // fallback (project-scoped statuses may not be loaded for this row).
  payloadName?: string
): Partial<IRecentTimeLog> => {
  const name = payloadName || statuses?.find(item => item.id === statusId)?.name;
  const statusColor = toSolidTagColor(colorCode);
  const statusColorDark = toSolidTagColor(colorCodeDark);

  return {
    ...(name ? { status_name: name } : {}),
    ...(statusColor ? { status_color: statusColor } : {}),
    ...(statusColorDark ? { status_color_dark: statusColorDark } : {}),
    ...(isDone !== undefined ? { is_done: isDone } : {}),
  };
};

const resolvePriorityFields = (
  priorityId: string | undefined,
  priorities: ITaskPriority[],
  // Prefer the name from the socket payload so this works before the priority
  // list has loaded.
  payloadName?: string
): Partial<IRecentTimeLog> => {
  const priority = priorities.find(item => item.id === priorityId);
  const name = payloadName || priority?.name;
  if (!name && !priority) return {};
  return {
    ...(name ? { priority_name: name } : {}),
    ...(priority?.color_code ? { priority_color: priority.color_code } : {}),
    ...(priority?.color_code_dark ? { priority_color_dark: priority.color_code_dark } : {}),
  };
};

type LogView = 'week' | 'list';
const LOG_VIEW_STORAGE_KEY = 'worklenz.logTime.view';

const readStoredLogView = (): LogView => {
  try {
    return localStorage.getItem(LOG_VIEW_STORAGE_KEY) === 'list' ? 'list' : 'week';
  } catch {
    return 'week';
  }
};

const storeLogView = (view: LogView) => {
  try {
    localStorage.setItem(LOG_VIEW_STORAGE_KEY, view);
  } catch {
    // Storage can be unavailable (private mode); the view just won't be remembered
  }
};

const formatSeconds = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
};

const HomeLogTime: React.FC = () => {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const { t } = useTranslation('home');
  const themeMode = useAppSelector(state => state.themeReducer.mode);
  const dispatch = useAppDispatch();
  const { socket } = useSocket();
  const { isDesktop } = useResponsive();

  const formatLogDate = (createdAt: string): string => {
    const date = dayjs(createdAt);
    if (date.isSame(dayjs(), 'day')) return t('logTime.today', { defaultValue: 'Today' });
    if (date.isSame(dayjs().subtract(1, 'day'), 'day')) return t('logTime.yesterday', { defaultValue: 'Yesterday' });
    return date.format('MMM D');
  };

  type LogSortField = 'project_name' | 'task_name' | 'priority_name' | 'time_spent' | 'created_at' | null;

  // Matches the Overview page's priority-table sort affordance (TasksList.tsx) —
  // stacked up/down carets, active direction highlighted in the theme's primary color.
  const SortArrows: React.FC<{ active: 'asc' | 'desc' | null }> = ({ active }) => {
    const { token } = theme.useToken();
    return (
      <span style={{ display: 'inline-flex', flexDirection: 'column', marginLeft: 4, lineHeight: 0 }}>
        <CaretUpOutlined
          style={{ fontSize: 9, color: active === 'asc' ? token.colorPrimary : token.colorTextQuaternary }}
        />
        <CaretDownOutlined
          style={{ fontSize: 9, marginTop: -2, color: active === 'desc' ? token.colorPrimary : token.colorTextQuaternary }}
        />
      </span>
    );
  };

  const { data: projectListData } = useGetProjectsByTeamQuery();
  const projects = useMemo(() => projectListData?.body || [], [projectListData]);
  const priorities = useAppSelector(state => state.priorityReducer.priorities);

  useEffect(() => {
    dispatch(fetchPriorities());
  }, [dispatch]);

  const [selProjectId, setSelProjectId] = useState<string | undefined>(undefined);
  const [selTaskId, setSelTaskId] = useState<string | undefined>(undefined);
  const [tasks, setTasks] = useState<ITaskInProject[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const quickEntryRef = useRef<HTMLDivElement>(null);

  const [date, setDate] = useState<Dayjs>(dayjs());
  const [startTime, setStartTime] = useState<Dayjs | null>(null);
  const [endTime, setEndTime] = useState<Dayjs | null>(null);
  const endTimeInputRef = useRef<InputRef>(null);
  const [activity, setActivity] = useState<TimeLogActivity>(DEFAULT_TIME_LOG_ACTIVITY);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [recentLogs, setRecentLogs] = useState<IRecentTimeLog[]>([]);
  const [recentLogsLoading, setRecentLogsLoading] = useState(false);

  // Week calendar (default) vs. Recently Logged list
  const [logView, setLogView] = useState<LogView>(readStoredLogView);
  const [weekStart, setWeekStart] = useState<Dayjs>(() => getWeekStart());
  const [weekRefreshKey, setWeekRefreshKey] = useState(0);
  const weekLogs = useMyWeekTimeLogs(weekStart, weekRefreshKey);

  // Google Calendar events of the week that are not logged yet, shown as faded placeholders.
  // Clicking one fills Quick Time Entry; the log is linked to the event so it disappears after.
  const weekEnd = useMemo(() => weekStart.add(6, 'day'), [weekStart]);
  const { status: googleStatus, eventsByDate } = useGoogleCalendarEvents(weekStart, weekEnd);
  const [selectedGhost, setSelectedGhost] = useState<IWeekGhostEvent | null>(null);
  const [meetingsTask, setMeetingsTask] = useState<{ id: string; name: string } | null>(null);

  const ghostEvents = useMemo(() => {
    const loggedEventIds = new Set(weekLogs.logs.map(log => log.google_event_id).filter(Boolean));
    const now = dayjs();
    const byId = new Map<string, IWeekGhostEvent>();
    eventsByDate.forEach(events =>
      events.forEach(event => {
        if (event.is_all_day || !event.start_at || !event.end_at) return;
        if (byId.has(event.google_event_id) || loggedEventIds.has(event.google_event_id)) return;
        const start = dayjs(event.start_at);
        // Future time can't be logged, so only events that have started are offered.
        if (!start.isBefore(now)) return;
        byId.set(event.google_event_id, {
          id: event.google_event_id,
          title: event.title || t('homeCalendar.google.untitled', { defaultValue: '(No title)' }),
          start,
          end: dayjs(event.end_at),
          color: getCalendarColor(event),
        });
      })
    );
    return Array.from(byId.values());
  }, [eventsByDate, weekLogs.logs, t]);

  // Recently Logged table — sort/filter/pagination state
  const [logSortField, setLogSortField] = useState<LogSortField>('created_at');
  const [logSortOrder, setLogSortOrder] = useState<'asc' | 'desc'>('desc');
  const [logCurrentPage, setLogCurrentPage] = useState(1);
  const logPageSize = 10;
  const [selectedLogProjectIds, setSelectedLogProjectIds] = useState<React.Key[]>([]);
  const [selectedLogStatusNames, setSelectedLogStatusNames] = useState<React.Key[]>([]);
  const [selectedLogPriorityNames, setSelectedLogPriorityNames] = useState<React.Key[]>([]);

  // Store original task names to restore if drawer closes without saving
  const originalTaskNamesRef = useRef<Map<string, string>>(new Map());

  const refreshData = useCallback(() => {
    setRecentLogsLoading(true);
    taskTimeLogsApiService.getRecentTimeLogs(100)
      .then(res => { if (res.done) setRecentLogs(res.body as IRecentTimeLog[]); })
      .catch(() => {})
      .finally(() => setRecentLogsLoading(false));
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  // Real-time task field updates via socket (status, priority, billable, name)
  useEffect(() => {
    if (!socket) return;

    const getLookupData = () => {
      const state = store.getState();
      return {
        statuses: state.taskDrawerReducer.taskFormViewModel?.statuses,
        priorities: state.priorityReducer.priorities,
        drawerPriorities: state.taskDrawerReducer.taskFormViewModel?.priorities,
      };
    };

    const handleTaskNameChange = (data: { id: string; name: string }) => {
      if (!data?.id || !data.name) return;
      patchRecentLogsForTask(setRecentLogs, data.id, {
        task_name: decodeHtmlEntities(data.name),
      });
    };

    const handleTaskStatusChange = (data: ITaskListStatusChangeResponse) => {
      if (!data?.id || data.completed_deps === false || data.phase_guard_blocked) return;
      const { statuses } = getLookupData();
      patchRecentLogsForTask(
        setRecentLogs,
        data.id,
        resolveStatusFields(
          data.status_id,
          statuses,
          data.color_code,
          data.color_code_dark,
          data.statusCategory?.is_done,
          data.status_name
        )
      );
    };

    const handleTaskPriorityChange = (data: ITaskListPriorityChangeResponse) => {
      if (!data?.id) return;
      const { priorities: globalPriorities, drawerPriorities } = getLookupData();
      const priorityList = globalPriorities?.length ? globalPriorities : drawerPriorities || [];
      patchRecentLogsForTask(setRecentLogs, data.id, {
        ...resolvePriorityFields(data.priority_id, priorityList, data.priority_name),
        ...(data.color_code ? { priority_color: data.color_code } : {}),
        ...(data.color_code_dark ? { priority_color_dark: data.color_code_dark } : {}),
      });
    };

    const handleTaskBillableChange = (data: { id: string; billable: boolean; error?: string }) => {
      if (!data?.id || data.error) return;
      patchRecentLogsForTask(setRecentLogs, data.id, { billable: data.billable });
    };

    socket.on(SocketEvents.TASK_NAME_CHANGE.toString(), handleTaskNameChange);
    socket.on(SocketEvents.TASK_STATUS_CHANGE.toString(), handleTaskStatusChange);
    socket.on(SocketEvents.TASK_PRIORITY_CHANGE.toString(), handleTaskPriorityChange);
    socket.on(SocketEvents.TASK_BILLABLE_CHANGE.toString(), handleTaskBillableChange);

    return () => {
      socket.off(SocketEvents.TASK_NAME_CHANGE.toString(), handleTaskNameChange);
      socket.off(SocketEvents.TASK_STATUS_CHANGE.toString(), handleTaskStatusChange);
      socket.off(SocketEvents.TASK_PRIORITY_CHANGE.toString(), handleTaskPriorityChange);
      socket.off(SocketEvents.TASK_BILLABLE_CHANGE.toString(), handleTaskBillableChange);
    };
  }, [socket]);

  // Real-time task field updates: sync with Redux while the Task Drawer is open
  const selectedTaskId = useAppSelector(state => state.taskDrawerReducer.selectedTaskId);
  const showTaskDrawer = useAppSelector(state => state.taskDrawerReducer.showTaskDrawer);

  // Logs can be edited or deleted in the task drawer — refresh the week once it closes.
  const wasTaskDrawerOpenRef = useRef(false);
  useEffect(() => {
    if (wasTaskDrawerOpenRef.current && !showTaskDrawer) setWeekRefreshKey(key => key + 1);
    wasTaskDrawerOpenRef.current = showTaskDrawer;
  }, [showTaskDrawer]);
  const taskFormViewModel = useAppSelector(state => state.taskDrawerReducer.taskFormViewModel);
  const taskManagementEntities = useAppSelector(state => state.taskManagement.entities);

  // Capture original task name when drawer opens
  useEffect(() => {
    if (showTaskDrawer && selectedTaskId) {
      // Find the original task name from our local state
      const logInList = recentLogs.find(l => l.task_id === selectedTaskId);
      const originalName = logInList?.task_name;
      
      if (originalName && !originalTaskNamesRef.current.has(selectedTaskId)) {
        originalTaskNamesRef.current.set(selectedTaskId, originalName);
      }
    } else if (!showTaskDrawer && selectedTaskId) {
      // Drawer closed - restore original name if current name is empty or invalid
      const originalName = originalTaskNamesRef.current.get(selectedTaskId);
      if (originalName) {
        const currentTask = taskManagementEntities[selectedTaskId];
        const currentName = taskFormViewModel?.task?.name || currentTask?.title;
        
        // If current name is empty or whitespace-only, restore the original
        if (!currentName || !currentName.trim()) {
          setRecentLogs(prevLogs =>
            prevLogs.map(log =>
              log.task_id === selectedTaskId ? { ...log, task_name: originalName } : log
            )
          );
        }
        
        // Clean up the stored original name
        originalTaskNamesRef.current.delete(selectedTaskId);
      }
    }
  }, [showTaskDrawer, selectedTaskId, recentLogs, taskFormViewModel, taskManagementEntities]);

  // Real-time sync: Update list as user types, but show original name if empty
  const currentTaskName = useMemo(() => {
    if (!selectedTaskId || !showTaskDrawer) return null;
    
    const drawerTaskName = taskFormViewModel?.task?.name;
    const taskEntity = taskManagementEntities[selectedTaskId];
    const taskName = drawerTaskName !== undefined ? drawerTaskName : (taskEntity?.title || null);
    
    // If the name is empty or whitespace-only, return a special marker
    if (!taskName || !taskName.trim()) {
      return '__EMPTY__';
    }
    
    return taskName;
  }, [selectedTaskId, showTaskDrawer, taskFormViewModel?.task?.name, taskManagementEntities]);

  useEffect(() => {
    if (!selectedTaskId || !currentTaskName) return;

    // If name is empty, show the original name
    if (currentTaskName === '__EMPTY__') {
      const originalName = originalTaskNamesRef.current.get(selectedTaskId);
      if (originalName) {
        setRecentLogs(prevLogs =>
          prevLogs.map(log =>
            log.task_id === selectedTaskId ? { ...log, task_name: originalName } : log
          )
        );
      }
      return;
    }

    // Normal case: update with the current name
    const decodedName = decodeHtmlEntities(currentTaskName);

    setRecentLogs(prevLogs =>
      prevLogs.map(log =>
        log.task_id === selectedTaskId ? { ...log, task_name: decodedName } : log
      )
    );
  }, [selectedTaskId, currentTaskName]);

  // Sync status, priority, and billable from the open Task Drawer
  const drawerTask = showTaskDrawer ? taskFormViewModel?.task : null;
  const drawerStatuses = taskFormViewModel?.statuses;
  const drawerPriorities = taskFormViewModel?.priorities;

  useEffect(() => {
    if (!showTaskDrawer || !selectedTaskId || !drawerTask || drawerTask.id !== selectedTaskId) return;

    const status = drawerStatuses?.find(item => item.id === drawerTask.status_id);
    const priorityId = drawerTask.priority_id;
    const priority =
      priorities.find(item => item.id === priorityId) ||
      drawerPriorities?.find(item => item.id === priorityId);

    patchRecentLogsForTask(setRecentLogs, selectedTaskId, {
      ...(status?.name ? { status_name: status.name } : {}),
      ...(drawerTask.status_color ? { status_color: toSolidTagColor(drawerTask.status_color) } : {}),
      ...(drawerTask.status_color_dark ? { status_color_dark: toSolidTagColor(drawerTask.status_color_dark) } : {}),
      ...(priority?.name ? { priority_name: priority.name } : {}),
      ...(priority?.color_code ? { priority_color: priority.color_code } : {}),
      ...(priority?.color_code_dark ? { priority_color_dark: priority.color_code_dark } : {}),
      ...(drawerTask.billable !== undefined ? { billable: drawerTask.billable } : {}),
    });
  }, [
    showTaskDrawer,
    selectedTaskId,
    drawerTask?.status_id,
    drawerTask?.status_color,
    drawerTask?.status_color_dark,
    drawerTask?.priority_id,
    drawerTask?.billable,
    drawerStatuses,
    drawerPriorities,
    priorities,
  ]);

  useEffect(() => {
    if (!selProjectId) {
      setTasks([]);
      return;
    }
    setTasksLoading(true);
    taskTimeLogsApiService
      .getMyTasksInProject(selProjectId, taskSearch || undefined)
      .then(res => { if (res.done) setTasks(res.body as ITaskInProject[]); })
      .catch(() => setTasks([]))
      .finally(() => setTasksLoading(false));
  }, [selProjectId, taskSearch]);

  const projectOptions = projects.map((p: IProject) => ({ value: p.id, label: p.name }));
  const taskOptions = [
    // The Meetings task may have just been created and not be in the loaded list yet.
    ...(meetingsTask && !tasks.some(task => task.id === meetingsTask.id)
      ? [{ value: meetingsTask.id, label: meetingsTask.name }]
      : []),
    ...tasks.map(t => ({ value: t.id, label: t.name })),
  ];

  /** Selects the project's Meetings task (created on first use) for a calendar event log. */
  const selectMeetingsTask = useCallback(
    async (projectId: string) => {
      try {
        const res = await taskTimeLogsApiService.getMeetingsTask(projectId);
        if (!res.done) throw new Error(res.message || 'Failed to load the Meetings task');
        setMeetingsTask(res.body);
        setSelTaskId(res.body.id);
      } catch {
        notification.error({
          message: t('logTime.calendarEvents.meetingsTaskFailed', {
            defaultValue: 'Could not prepare the Meetings task. Pick a task manually.',
          }),
        });
      }
    },
    [t]
  );

  const handleSelectGhost = (ghost: IWeekGhostEvent) => {
    setSelectedGhost(ghost);
    setDate(ghost.start.startOf('day'));
    setStartTime(ghost.start);
    setEndTime(ghost.end);
    setNotes(ghost.title.slice(0, 500));
    setActivity('meeting');
    if (selProjectId) void selectMeetingsTask(selProjectId);
    quickEntryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const clearSelectedGhost = () => setSelectedGhost(null);

  const loggedSeconds = useMemo(() => getTimeRangeSeconds(startTime, endTime), [startTime, endTime]);

  const isFormValid = useMemo(() => {
    if (!selProjectId || !selTaskId || !activity || !date || !startTime || !endTime) return false;
    return loggedSeconds > 0;
  }, [selProjectId, selTaskId, activity, date, loggedSeconds, startTime, endTime]);

  const handleProjectChange = (projectId: string) => {
    setSelProjectId(projectId);
    setSelTaskId(undefined);
    setTaskSearch('');
    setMeetingsTask(null);
    if (selectedGhost) void selectMeetingsTask(projectId);
  };

  const handleSubmit = async () => {
    if (!isFormValid) return;
    setSubmitting(true);
    try {
      // Persist the actual start clock time — backend stores formatted_start as
      // created_at, and the task-drawer edit form derives start/end from that.
      // Sending only the DatePicker value kept "now" (or midnight) and dropped
      // the Time Range start, so edit showed current time + same duration.
      if (!startTime) return;
      const formattedStart = dayjs(date)
        .hour(startTime.hour())
        .minute(startTime.minute())
        .second(0)
        .millisecond(0)
        .toISOString();

      await taskTimeLogsApiService.create({
        id: selTaskId,
        project_id: selProjectId,
        formatted_start: formattedStart,
        seconds_spent: loggedSeconds,
        activity,
        description: notes || undefined,
        google_event_id: selectedGhost?.id,
      });
      setSelectedGhost(null);
      setStartTime(null);
      setEndTime(null);
      setNotes('');
      refreshData();
      setWeekRefreshKey(key => key + 1);
    } catch {
      notification.error({ message: t('logTime.failedToLogTime', { defaultValue: 'Failed to log time' }) });
    } finally {
      setSubmitting(false);
    }
  };

  // Recently Logged — filter option lists derived from the currently loaded batch,
  // same approach as the Overview page's priority table (TasksList.tsx).
  const logProjectFilterOptions = useMemo(() => {
    const seen = new Map<string, string>();
    recentLogs.forEach(l => {
      if (l.project_id && l.project_name && !seen.has(l.project_id)) seen.set(l.project_id, l.project_name);
    });
    return Array.from(seen.entries()).map(([value, text]) => ({ text, value }));
  }, [recentLogs]);

  const logStatusFilterOptions = useMemo(() => {
    const seen = new Set<string>();
    recentLogs.forEach(l => { if (l.status_name) seen.add(l.status_name); });
    return Array.from(seen).map(name => ({ text: name, value: name }));
  }, [recentLogs]);

  const logPriorityFilterOptions = useMemo(() => {
    const seen = new Set<string>();
    recentLogs.forEach(l => { if (l.priority_name) seen.add(l.priority_name); });
    return Array.from(seen).map(name => ({ text: name, value: name }));
  }, [recentLogs]);

  const handleLogSortClick = useCallback(
    (field: LogSortField) => {
      setLogCurrentPage(1);
      setLogSortOrder(prev => (logSortField === field && prev === 'asc' ? 'desc' : 'asc'));
      setLogSortField(field);
    },
    [logSortField]
  );

  const renderLogSortableTitle = useCallback(
    (label: string, field: LogSortField) => (
      <span
        onClick={() => handleLogSortClick(field)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', cursor: 'pointer', userSelect: 'none' }}
      >
        <span>{label}</span>
        <SortArrows active={logSortField === field ? logSortOrder : null} />
      </span>
    ),
    [logSortField, logSortOrder, handleLogSortClick]
  );

  const filteredSortedLogs = useMemo(() => {
    let logs = recentLogs;
    if (selectedLogProjectIds.length) {
      logs = logs.filter(l => selectedLogProjectIds.includes(l.project_id || ''));
    }
    if (selectedLogStatusNames.length) {
      logs = logs.filter(l => selectedLogStatusNames.includes(l.status_name || ''));
    }
    if (selectedLogPriorityNames.length) {
      logs = logs.filter(l => selectedLogPriorityNames.includes(l.priority_name || ''));
    }
    if (!logSortField) return logs;

    const dir = logSortOrder === 'asc' ? 1 : -1;
    return [...logs].sort((a, b) => {
      if (logSortField === 'time_spent') return ((a.time_spent || 0) - (b.time_spent || 0)) * dir;
      if (logSortField === 'created_at') {
        return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
      }
      const av = (a[logSortField] || '').toString().toLowerCase();
      const bv = (b[logSortField] || '').toString().toLowerCase();
      return av.localeCompare(bv) * dir;
    });
  }, [recentLogs, logSortField, logSortOrder, selectedLogProjectIds, selectedLogStatusNames, selectedLogPriorityNames]);

  const handleOpenTask = useCallback(
    (record: IRecentTimeLog) => {
      if (!record.task_id) return;
      const allTaskIds = Array.from(new Set(filteredSortedLogs.map(l => l.task_id).filter(Boolean)));
      const currentIndex = allTaskIds.indexOf(record.task_id);

      // Pre-populate Redux with available task data to prevent loading flash
      dispatch(updateTask({
        id: record.task_id,
        title: record.task_name,
        projectId: record.project_id,
      } as Partial<Task> as Task));

      dispatch(
        setNavigationContext({
          taskIds: allTaskIds,
          currentIndex: currentIndex >= 0 ? currentIndex : 0,
          sourceView: 'home',
          projectId: record.project_id || null,
        })
      );

      dispatch(setSelectedTaskId(record.task_id));
      dispatch(fetchTask({ taskId: record.task_id, projectId: record.project_id }));
      dispatch(setProjectId(record.project_id));
      dispatch(setTargetDrawerTab('timeLog'));
      dispatch(setShowTaskDrawer(true));
    },
    [dispatch, filteredSortedLogs]
  );

  const handleOpenCalendarEntry = useCallback(
    (entry: IWeekCalendarEntry) => {
      const log = weekLogs.logs.find(l => l.id === entry.id);
      if (log) handleOpenTask(log);
    },
    [weekLogs.logs, handleOpenTask]
  );

  // Drag-resize on the week calendar: keeps the log's task, description and activity.
  const handleResizeEntry = useCallback<ResizeEntryHandler>(
    async (entry, start, seconds) => {
      const log = weekLogs.logs.find(l => l.id === entry.id);
      if (!log || seconds <= 0) return false;
      try {
        const res = await taskTimeLogsApiService.update(log.id, {
          id: log.task_id,
          seconds_spent: seconds,
          formatted_start: start.toISOString(),
          description: log.description || undefined,
          activity: log.activity || undefined,
        });
        if (!res.done) throw new Error(res.message || 'Failed to update the time log');
        setWeekRefreshKey(key => key + 1);
        refreshData();
        return true;
      } catch (error) {
        const message =
          (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          (error as Error)?.message;
        notification.error({
          message: t('logTime.week.resizeFailed', { defaultValue: 'Could not change the time log' }),
          description: message,
        });
        return false;
      }
    },
    [weekLogs.logs, refreshData, t]
  );

  const handleLogViewChange = (view: LogView) => {
    setLogView(view);
    storeLogView(view);
  };

  const logColumns: TableProps<IRecentTimeLog>['columns'] = useMemo(
    () => [
      {
        key: 'task',
        title: renderLogSortableTitle(t('logTime.taskColumn', { defaultValue: 'Task' }), 'task_name'),
        width: '20%',
        render: (_, record) => (
          <span
            style={{ cursor: 'pointer' }}
            onClick={() => handleOpenTask(record)}
            onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; }}
            onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
          >
            {record.task_name}
          </span>
        ),
      },
      {
        key: 'project',
        title: renderLogSortableTitle(t('logTime.projectColumn', { defaultValue: 'Project' }), 'project_name'),
        width: '18%',
        filters: logProjectFilterOptions,
        filteredValue: selectedLogProjectIds,
        onFilter: (value, record) => record.project_id === value,
        render: (_, record) => (
          <span
            style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
            onClick={() => record.project_id && navigate(`/worklenz/projects/${record.project_id}?tab=tasks-list&pinned_tab=tasks-list`)}
          >
            <Badge color={record.project_color || token.colorPrimary} />
            <span style={{ fontWeight: 500 }}>{record.project_name}</span>
          </span>
        ),
      },
      {
        key: 'status',
        title: t('logTime.statusColumn', { defaultValue: 'Status' }),
        width: '12%',
        ellipsis: true,
        filters: logStatusFilterOptions,
        filteredValue: selectedLogStatusNames,
        onFilter: (value, record) => record.status_name === value,
        render: (_, record) =>
          record.status_name ? (
            <TruncatedColoredTag
              label={record.status_name}
              color={themeMode === 'dark' ? record.status_color_dark : record.status_color}
            />
          ) : null,
      },
      {
        key: 'priority',
        title: renderLogSortableTitle(t('logTime.priorityColumn', { defaultValue: 'Priority' }), 'priority_name'),
        width: '12%',
        filters: logPriorityFilterOptions,
        filteredValue: selectedLogPriorityNames,
        onFilter: (value, record) => record.priority_name === value,
        render: (_, record) =>
          record.priority_name ? (
            <Tag
              color={themeMode === 'dark' ? record.priority_color_dark : record.priority_color}
              style={{ margin: 0, fontSize: 11 }}
            >
              {record.priority_name}
            </Tag>
          ) : null,
      },
      {
        key: 'time',
        title: renderLogSortableTitle(t('logTime.timeColumn', { defaultValue: 'Time' }), 'time_spent'),
        width: '10%',
        render: (_, record) => (
          <Tag color="#1677ff" style={{ margin: 0, fontSize: 11 }}>
            {formatSeconds(record.time_spent || 0)}
          </Tag>
        ),
      },
      {
        key: 'date',
        title: renderLogSortableTitle(t('logTime.dateColumn', { defaultValue: 'Date' }), 'created_at'),
        width: '10%',
        render: (_, record) => <span style={{ opacity: 0.5, fontSize: 11 }}>{formatLogDate(record.created_at)}</span>,
      },
      {
        key: 'createdTime',
        title: t('logTime.createdTimeColumn', { defaultValue: 'Created Time' }),
        width: '10%',
        render: (_, record) => {
          if (!record.created_at) {
            return <span style={{ opacity: 0.5, fontSize: 11 }}>-</span>;
          }
          return (
            <span style={{ fontSize: 11, opacity: 0.75 }}>
              {dayjs(record.created_at).format('HH:mm')}
            </span>
          );
        },
      },
    ],
    [
      renderLogSortableTitle,
      logProjectFilterOptions,
      logStatusFilterOptions,
      logPriorityFilterOptions,
      selectedLogProjectIds,
      selectedLogStatusNames,
      selectedLogPriorityNames,
      themeMode,
      token,
      navigate,
      handleOpenTask,
    ]
  );

  const fldLbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5, color: token.colorTextSecondary };
  const cardStyle: React.CSSProperties = {
    borderRadius: token.borderRadiusLG,
    border: `1px solid ${token.colorBorderSecondary}`,
    background: token.colorBgContainer,
    padding: 16,
  };

  return (
    <div style={{ padding: 24, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 20, flexShrink: 0 }}>
         <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{t('logTime.pageTitle', { defaultValue: 'Log Time' })}</h1>
         <p style={{ opacity: 0.5, fontSize: 13, margin: '4px 0 0' }}>{t('logTime.pageSubtitle', { defaultValue: 'Track time spent on your tasks.' })}</p>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: isDesktop ? 'row' : 'column',
          gap: isDesktop ? 24 : 16,
          alignItems: isDesktop ? 'stretch' : undefined,
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Quick Time Entry */}
        <div
          ref={quickEntryRef}
          style={{
            ...cardStyle,
            flex: isDesktop ? '0 0 360px' : '1 1 auto',
            width: isDesktop ? undefined : '100%',
            alignSelf: isDesktop ? 'flex-start' : 'stretch',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>{t('logTime.quickEntryTitle', { defaultValue: 'Quick Time Entry' })}</div>

          <div style={{ marginBottom: 14 }}>
            <label style={fldLbl}>{t('logTime.projectLabel', { defaultValue: 'Project' })}</label>
            <Select
              showSearch
              style={{ width: '100%' }}
              placeholder={t('logTime.projectPlaceholder', { defaultValue: 'Select project' })}
              optionFilterProp="label"
              options={projectOptions}
              value={selProjectId}
              onChange={handleProjectChange}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={fldLbl}>{t('logTime.taskLabel', { defaultValue: 'Task' })}</label>
            <Select
              showSearch
              style={{ width: '100%' }}
              placeholder={selProjectId ? t('logTime.taskPlaceholder', { defaultValue: 'Select task' }) : t('logTime.taskDisabledPlaceholder', { defaultValue: 'Select a project first' })}
              disabled={!selProjectId}
              loading={tasksLoading}
              filterOption={false}
              onSearch={setTaskSearch}
              options={taskOptions}
              value={selTaskId}
              onChange={setSelTaskId}
              notFoundContent={tasksLoading ? t('logTime.taskSearching', { defaultValue: 'Searching...' }) : t('logTime.noTasksFound', { defaultValue: 'No tasks found' })}
              dropdownRender={menu => (
                <>
                  {menu}
                  <div
                    style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, padding: '6px 8px' }}
                  >
                    <Button
                      type="link"
                      size="small"
                      disabled={!selProjectId}
                      onClick={() => setAddTaskOpen(true)}
                      style={{ padding: 0 }}
                    >
                       {t('logTime.addNewTask', { defaultValue: '+ Add New Task' })}
                    </Button>
                  </div>
                </>
              )}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={fldLbl} id="quick-entry-activity-label">
              <span style={{ color: token.colorError }}>*</span> {t('logTime.activityLabel', { defaultValue: 'Activity' })}
            </label>
            <TimeLogActivitySelect
              aria-labelledby="quick-entry-activity-label"
              value={activity}
              onChange={setActivity}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={fldLbl}><span style={{ color: token.colorError }}>*</span> {t('logTime.dateLabel', { defaultValue: 'Date' })}</label>
            <DatePicker
              style={{ width: '100%' }}
              value={date}
              onChange={d => d && setDate(d)}
              disabledDate={current => current && current.toDate() > new Date()}
            />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={fldLbl}><span style={{ color: token.colorError }}>*</span> {t('logTime.requiredStartTime', { defaultValue: 'Start Time' })}</label>
              <TimeTextInput
                style={{ width: '100%' }}
                aria-label={t('logTime.requiredStartTime', { defaultValue: 'Start Time' })}
                value={startTime}
                onChange={setStartTime}
                onComplete={() => endTimeInputRef.current?.focus()}
              />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <label style={fldLbl}><span style={{ color: token.colorError }}>*</span> {t('logTime.requiredEndTime', { defaultValue: 'End Time' })}</label>
              <TimeTextInput
                ref={endTimeInputRef}
                style={{ width: '100%' }}
                aria-label={t('logTime.requiredEndTime', { defaultValue: 'End Time' })}
                value={endTime}
                onChange={setEndTime}
              />
            </div>
          </div>
          <TimeRangeDurationHint
            start={startTime}
            end={endTime}
            style={{ marginTop: -6, marginBottom: 14 }}
          />

          <div style={{ marginBottom: 16 }}>
            <label style={fldLbl}>{t('logTime.workDescriptionLabel', { defaultValue: 'Description' })}</label>
            <Input
              placeholder={t('logTime.workDescriptionPlaceholder', { defaultValue: 'What did you work on?' })}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <Button
            type="primary"
            loading={submitting}
            disabled={!isFormValid}
            onClick={handleSubmit}
          >
            {t('logTime.submitButton', { defaultValue: 'Log Time' })}
          </Button>

          {/* Below the form, so selecting an event doesn't shift the fields */}
          {selectedGhost && (
            <Alert
              type="info"
              showIcon
              closable
              onClose={clearSelectedGhost}
              style={{ marginTop: 14 }}
              message={t('logTime.calendarEvents.logging', {
                defaultValue: 'Logging calendar event: {{title}}',
                title: selectedGhost.title,
              })}
              description={
                selProjectId
                  ? undefined
                  : t('logTime.calendarEvents.pickProject', {
                      defaultValue: 'Pick the project; the time goes to its Meetings task.',
                    })
              }
            />
          )}
        </div>

        {/* Right column */}
        <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0, gap: 16 }}>
          {/* Recently Logged — fills the remaining vertical space down to the
              bottom of the screen; only the table body scrolls internally,
              same pattern as the Overview page's priority table. */}
          <div
            className="recent-logs-card"
            style={
              {
                ...cardStyle,
                flex: isDesktop ? 1 : 'initial',
                minHeight: isDesktop ? 0 : 'auto',
                display: 'flex',
                flexDirection: 'column',
                '--sticky-header-bg': token.colorBgContainer,
              } as React.CSSProperties
            }
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexShrink: 0 }}>
               <Segmented<LogView>
                 size="small"
                 value={logView}
                 onChange={handleLogViewChange}
                 options={[
                   { value: 'week', label: t('logTime.week.viewWeek', { defaultValue: 'Week' }) },
                   { value: 'list', label: t('logTime.recentlyLogged', { defaultValue: 'Recently Logged' }) },
                 ]}
               />
               <Button
                 type="link"
                 size="small"
                 style={{ fontSize: 12, padding: 0 }}
                 onClick={() => navigate('/worklenz/time-entries')}
               >
                  {t('logTime.viewAll', { defaultValue: 'View All' })}
               </Button>
            </div>

            {logView === 'week' ? (
              <>
                {googleStatus?.configured && !googleStatus.connected && (
                  <Button
                    type="link"
                    size="small"
                    style={{ alignSelf: 'flex-start', padding: 0, marginBottom: 6, fontSize: 12 }}
                    onClick={() => navigate('/worklenz/settings/integrations')}
                  >
                    {t('logTime.calendarEvents.connect', {
                      defaultValue: 'Connect Google Calendar to log your meetings from here',
                    })}
                  </Button>
                )}
                <MyWeekCalendar
                  weekStart={weekStart}
                  onWeekStartChange={setWeekStart}
                  entries={weekLogs.entries}
                  isLoading={weekLogs.isLoading}
                  hasError={weekLogs.hasError}
                  onRetry={weekLogs.reload}
                  onOpenEntry={handleOpenCalendarEntry}
                  ghostEvents={ghostEvents}
                  selectedGhostId={selectedGhost?.id ?? null}
                  onSelectGhost={handleSelectGhost}
                  onResizeEntry={handleResizeEntry}
                />
              </>
            ) : (
            <>

            <div
              className="recent-logs-scroll"
              style={{
                flex: isDesktop ? 1 : 'initial',
                minHeight: isDesktop ? 0 : 'auto',
                overflowY: isDesktop ? 'auto' : 'visible',
                position: 'relative',
              }}
            >
              <Table<IRecentTimeLog>
                dataSource={
                  recentLogsLoading
                    ? []
                    : filteredSortedLogs.slice((logCurrentPage - 1) * logPageSize, logCurrentPage * logPageSize)
                }
                rowKey={record => record.id}
                columns={logColumns}
                size="middle"
                pagination={false}
                tableLayout="fixed"
                loading={recentLogsLoading}
                locale={{
                   emptyText: (
                     <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                       <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{t('logTime.emptyTitle', { defaultValue: 'No time logged yet' })}</div>
                       <p style={{ opacity: 0.6, fontSize: 12, margin: '0 0 16px' }}>
                         {t('logTime.emptySubtitle', { defaultValue: 'Start logging time on your tasks to see your activity here.' })}
                       </p>
                       <Button
                         type="primary"
                         size="small"
                         onClick={() =>
                           quickEntryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                         }
                       >
                         {t('logTime.logTimeButton', { defaultValue: 'Log Time' })}
                       </Button>
                     </div>
                   ),
                }}
                onChange={(_pagination, filters) => {
                  setLogCurrentPage(1);
                  setSelectedLogProjectIds((filters.project as React.Key[]) || []);
                  setSelectedLogStatusNames((filters.status as React.Key[]) || []);
                  setSelectedLogPriorityNames((filters.priority as React.Key[]) || []);
                }}
              />
            </div>

            {filteredSortedLogs.length > logPageSize && (
              <div style={{ flexShrink: 0, marginTop: 12, textAlign: 'right', display: 'flex', justifyContent: 'flex-end' }}>
                <Pagination
                  current={logCurrentPage}
                  pageSize={logPageSize}
                  total={filteredSortedLogs.length}
                  onChange={setLogCurrentPage}
                  showSizeChanger={false}
                  size="small"
                />
              </div>
            )}
            </>
            )}
          </div>
        </div>
      </div>

      <HomeAddTaskModal
        open={addTaskOpen}
        defaultDate={null}
        onClose={() => {
          setAddTaskOpen(false);
          if (selProjectId) {
            taskTimeLogsApiService.getMyTasksInProject(selProjectId, taskSearch || undefined)
              .then(res => { if (res.done) setTasks(res.body as ITaskInProject[]); })
              .catch(() => {});
          }
        }}
      />
    </div>
  );
};

export default HomeLogTime;
