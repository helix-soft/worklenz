import React from 'react';
import { Button, DatePicker, Form, Input, Flex, InputRef } from '@/shared/antd-imports';
import { TimeTextInput } from '@/components/common/time-text-input/TimeTextInput';
import { getTimeRangeSeconds } from '@/utils/time-text-input';
import {
  DEFAULT_TIME_LOG_ACTIVITY,
  isTimeLogActivity,
  TimeLogActivity,
} from '@/shared/time-log-activities';
import { TimeLogActivitySelect } from '@/components/time-entries/TimeLogActivitySelect';
import { TimeRangeDurationHint } from '@/components/time-entries/TimeRangeDurationHint';
import { ClockCircleOutlined, InfoCircleOutlined } from '@/shared/antd-imports';

import dayjs, { Dayjs } from 'dayjs';

import { useAppSelector } from '@/hooks/useAppSelector';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import { fetchOrgConfig } from '@/features/org-config/org-config.slice';
import { themeWiseColor } from '@/utils/themeWiseColor';
import { useAuthService } from '@/hooks/useAuth';
import { useSocket } from '@/socket/socketContext';
import { SocketEvents } from '@/shared/socket-events';
import { ITaskAssigneesUpdateResponse } from '@/types/tasks/task-assignee-update-response';
import { ITaskLogViewModel } from '@/types/tasks/task-log-view.types';
import { Select, Spin, Tooltip } from '@/shared/antd-imports';
import { taskTimeLogsApiService, IRecentProject, ITaskInProject } from '@/api/tasks/task-time-logs.api.service';
import apiClient from '@/api/api-client';
import { API_BASE_URL } from '@/shared/constants';
import { useTranslation } from 'react-i18next';


interface TimeLogFormProps {
  onCancel: () => void;
  onSubmitSuccess?: () => void;
  initialValues?: ITaskLogViewModel;
  mode?: 'create' | 'edit';
  taskId?: string;
  projectId?: string;
  allowReassign?: boolean;  // Allow the form to reassign the log to a different task/project in edit mode


}

interface TimeLogFormValues {
  activity: TimeLogActivity | null;
  date: Dayjs | null;
  startTime: Dayjs | null;
  endTime: Dayjs | null;
  description?: string;
}

const TimeLogForm = ({
  onCancel,
  onSubmitSuccess,
  initialValues,
  mode = 'create',
  taskId: taskIdProp,
  projectId: projectIdProp,
  allowReassign = false,

}: TimeLogFormProps) => {
  const { t } = useTranslation('task-drawer/task-drawer');
  const currentSession = useAuthService().getCurrentSession();
  const { socket, connected } = useSocket();
  const [form] = Form.useForm();
  const endTimeInputRef = React.useRef<InputRef>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // Reassign state — only used when allowReassign=true and mode=edit
  const [reassignProjects, setReassignProjects] = React.useState<IRecentProject[]>([]);
  const [reassignProjectSearch, setReassignProjectSearch] = React.useState('');
  const [reassignProjectSearchResults, setReassignProjectSearchResults] = React.useState<IRecentProject[]>([]);
  const [reassignProjectLoading, setReassignProjectLoading] = React.useState(false);
  const [selectedReassignProject, setSelectedReassignProject] = React.useState<IRecentProject | null>(null);
  const [reassignTasks, setReassignTasks] = React.useState<ITaskInProject[]>([]);
  const [reassignTaskSearch, setReassignTaskSearch] = React.useState('');
  const [reassignTaskLoading, setReassignTaskLoading] = React.useState(false);
  const [selectedReassignTaskId, setSelectedReassignTaskId] = React.useState<string | null>(null);
  const reassignProjectSearchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const reassignTaskSearchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);


  const [formValues, setFormValues] = React.useState<TimeLogFormValues>({
    date: dayjs(),
    startTime: dayjs().second(0).millisecond(0),
    endTime: dayjs().second(0).millisecond(0).add(30, 'minute'),
    activity: DEFAULT_TIME_LOG_ACTIVITY,
  });

  const themeMode = useAppSelector(state => state.themeReducer.mode);
  const { taskFormViewModel } = useAppSelector(state => state.taskDrawerReducer);

  const dispatch = useAppDispatch();
  const backdateLimitDays = useAppSelector(
    state => state.orgConfigReducer.timelog_backdate_limit_days
  );
  const orgConfigInitialized = useAppSelector(state => state.orgConfigReducer.isInitialized);
  const orgConfigLoading = useAppSelector(state => state.orgConfigReducer.isLoading);

  // The form is reachable outside the settings page, so pull the org config in
  // on first use. Once initialized the store keeps it for the rest of the session.
  React.useEffect(() => {
    if (orgConfigInitialized || orgConfigLoading) return;
    void dispatch(fetchOrgConfig());
  }, [dispatch, orgConfigInitialized, orgConfigLoading]);

  // Earliest date a log may carry, or null when the org sets no limit.
  const minLogDate = React.useMemo(() => {
    if (!backdateLimitDays || backdateLimitDays <= 0) return null;
    return dayjs().startOf('day').subtract(backdateLimitDays, 'day');
  }, [backdateLimitDays]);

  // In edit mode the log's own date must stay selectable even once it ages past
  // the limit, so description/duration edits remain possible. The backend applies
  // the same exemption for an unchanged date.
  const originalLogDate = React.useMemo(() => {
    if (mode !== 'edit' || !initialValues?.created_at) return null;
    return dayjs(initialValues.created_at).startOf('day');
  }, [mode, initialValues?.created_at]);

  const isDateDisabled = React.useCallback(
    (current: Dayjs) => {
      if (!current) return false;
      if (current.toDate() > new Date()) return true;
      if (!minLogDate) return false;
      if (originalLogDate && current.isSame(originalLogDate, 'day')) return false;
      return current.isBefore(minLogDate, 'day');
    },
    [minLogDate, originalLogDate]
  );

  const getNowRoundedToMinute = React.useCallback(() => {
    return dayjs().second(0).millisecond(0);
  }, []);

  React.useEffect(() => {
    if (initialValues && mode === 'edit') {
      const createdAt = dayjs(initialValues.created_at);
      const startTime = dayjs(initialValues.start_time || initialValues.created_at);

      let endTime: Dayjs;
      if (initialValues.end_time) {
        endTime = dayjs(initialValues.end_time);
      } else if (initialValues.time_spent) {
        endTime = dayjs(startTime).add(initialValues.time_spent, 'second');
      } else {
        endTime = dayjs(initialValues.created_at);
      }

      const nextValues: TimeLogFormValues = {
        date: createdAt,
        startTime,
        endTime,
        description: initialValues.description || '',
        // Logs from before activities existed get the default
        activity: isTimeLogActivity(initialValues.activity)
          ? initialValues.activity
          : DEFAULT_TIME_LOG_ACTIVITY,
      };

      form.setFieldsValue(nextValues);
      setFormValues(nextValues);
    } else if (mode === 'create') {
      const now = getNowRoundedToMinute();
      const nextValues: TimeLogFormValues = {
        date: dayjs(),
        startTime: now,
        endTime: now.add(30, 'minute'),
        activity: DEFAULT_TIME_LOG_ACTIVITY,
      };
      form.setFieldsValue(nextValues);
      setFormValues(nextValues);
    }
  }, [initialValues, mode, form, getNowRoundedToMinute]);

  // Load recent projects when reassign is enabled
  React.useEffect(() => {
    if (!allowReassign || mode !== 'edit') return;
    setSelectedReassignProject(null);
    setSelectedReassignTaskId(null);
    setReassignTasks([]);
    setReassignProjectSearch('');
    setReassignProjectSearchResults([]);
    taskTimeLogsApiService.getMyRecentProjects().then(res => {
      if (res.done) setReassignProjects(res.body as IRecentProject[]);
    });
  }, [allowReassign, mode, initialValues?.id]);

  // Search projects for reassign
  React.useEffect(() => {
    if (!allowReassign) return;
    if (reassignProjectSearchTimer.current) clearTimeout(reassignProjectSearchTimer.current);
    if (!reassignProjectSearch.trim()) {
      setReassignProjectSearchResults([]);
      return;
    }
    reassignProjectSearchTimer.current = setTimeout(async () => {
      setReassignProjectLoading(true);
      try {
        const res = await apiClient.get(`${API_BASE_URL}/projects/my-task-projects`);
        const list: any[] = res.data?.body || [];
        const q = reassignProjectSearch.toLowerCase();
        setReassignProjectSearchResults(
          list
            .filter((p: any) => p.name?.toLowerCase().includes(q))
            .map((p: any) => ({ id: p.id, name: p.name, color_code: p.color_code }))
        );
      } catch {
        setReassignProjectSearchResults([]);
      } finally {
        setReassignProjectLoading(false);
      }
    }, 300);
  }, [reassignProjectSearch, allowReassign]);

  // Load tasks when reassign project is selected
  React.useEffect(() => {
    if (!selectedReassignProject) return;
    if (reassignTaskSearchTimer.current) clearTimeout(reassignTaskSearchTimer.current);
    reassignTaskSearchTimer.current = setTimeout(async () => {
      setReassignTaskLoading(true);
      try {
        const res = await taskTimeLogsApiService.getMyTasksInProject(
          selectedReassignProject.id,
          reassignTaskSearch || undefined
        );
        if (res.done) setReassignTasks(res.body as ITaskInProject[]);
      } catch {
        setReassignTasks([]);
      } finally {
        setReassignTaskLoading(false);
      }
    }, 200);
  }, [selectedReassignProject, reassignTaskSearch]);


  const quickAssignMember = (session: any) => {
    if (!taskFormViewModel?.task || !connected) return;

    const body = {
      team_member_id: session.team_member_id,
      project_id: taskFormViewModel?.task?.project_id,
      task_id: taskFormViewModel?.task?.id,
      reporter_id: session?.id,
      mode: 0,
      parent_task: taskFormViewModel?.task?.parent_task_id,
    };
    socket?.emit(SocketEvents.QUICK_ASSIGNEES_UPDATE.toString(), JSON.stringify(body));
    socket?.once(
      SocketEvents.QUICK_ASSIGNEES_UPDATE.toString(),
      (response: ITaskAssigneesUpdateResponse) => {
        if (session.team_member_id) {
          // TODO: emitTimeLogAssignMember(response);
        }
      }
    );
  };

  const createReqBody = (values: TimeLogFormValues) => {
    if (!values.date || !values.startTime || !values.endTime) return;

    const formattedStartTime = dayjs(values.date)
      .hour(values.startTime.hour())
      .minute(values.startTime.minute())
      .second(0)
      .millisecond(0);

    return {
      id: mode === 'edit' && initialValues?.id ? initialValues.id : (taskIdProp ?? taskFormViewModel?.task?.id),
      project_id: (projectIdProp ?? taskFormViewModel?.task?.project_id) as string,
      formatted_start: formattedStartTime.toISOString(),
      seconds_spent: getTimeRangeSeconds(values.startTime, values.endTime),
      description: values.description,
      activity: values.activity,
      // Only include new_task_id if user explicitly selected a different task
      ...(mode === 'edit' && selectedReassignTaskId ? { new_task_id: selectedReassignTaskId } : {}),
    };
  };

  const onFinish = async (values: TimeLogFormValues) => {
    if (getTimeRangeSeconds(values.startTime, values.endTime) <= 0) {
      form.setFields([
        {
          name: 'endTime',
          errors: [
            t('taskTimeLogTab.timeLogForm.sameStartEndError', {
              defaultValue: 'Start and end time cannot be the same',
            }),
          ],
        },
      ]);
      return;
    }

    if (!currentSession) return;

    const assignees = taskFormViewModel?.task?.assignees as string[] | undefined;
    if (assignees && !assignees.includes(currentSession?.team_member_id as string)) {
      quickAssignMember(currentSession);
    }

    // Client-side mirror of the org backdate limit, so the user sees the problem
    // before a round trip. The server enforces the same rule regardless.
    if (
      minLogDate &&
      values.date &&
      values.date.isBefore(minLogDate, 'day') &&
      !(originalLogDate && values.date.isSame(originalLogDate, 'day'))
    ) {
      form.setFields([
        {
          name: 'date',
          errors: [
            t('taskTimeLogTab.timeLogForm.backdateLimitError', {
              days: backdateLimitDays,
              earliestDate: minLogDate.format('MMM DD, YYYY'),
              defaultValue:
                'Time logs cannot be backdated more than {{days}} days. The earliest date you can log against is {{earliestDate}}.',
            }),
          ],
        },
      ]);
      return;
    }

    const requestBody = createReqBody(values);
    if (!requestBody) return;

    setSubmitting(true);
    try {
      if (mode === 'edit' && initialValues?.id) {
        await taskTimeLogsApiService.update(initialValues.id, requestBody);
      } else {
        await taskTimeLogsApiService.create(requestBody);
      }

      // Call onSubmitSuccess if provided, otherwise just cancel
      if (onSubmitSuccess) {
        onSubmitSuccess();
      } else {
        onCancel();
      }
    } catch (error: any) {
      const serverMessage = error?.response?.data?.message;
      form.setFields([
        {
          name: 'date',
          errors: [
            serverMessage ||
              t('taskTimeLogTab.timeLogForm.saveError', {
                defaultValue: 'Could not save the time log. Please try again.',
              }),
          ],
        },
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  const isFormValid = () =>
    Boolean(formValues.activity) &&
    Boolean(formValues.date) &&
    getTimeRangeSeconds(formValues.startTime, formValues.endTime) > 0;

  return (
    <Flex
      gap={8}
      vertical
      align="center"
      justify="center"
      style={{
        width: '100%',
        position: 'relative',
        height: 'fit-content',
        justifySelf: 'flex-end',
        paddingTop: 16,
        paddingBottom: 0,
        overflow: 'visible',
      }}
    >
      <div
        style={{
          marginBlockEnd: 0,
          height: 1,
          position: 'absolute',
          top: 0,
          width: '100%',
          backgroundColor: themeWiseColor('#ebebeb', '#3a3a3a', themeMode),
        }}
      />

      <Form
        form={form}
        style={{ width: '100%', overflow: 'visible' }}
        layout="vertical"
        onFinish={onFinish}
        onValuesChange={(_changedValues, values) => setFormValues(values as TimeLogFormValues)}
      >
        <Form.Item
          name="activity"
          label={t('taskTimeLogTab.timeLogForm.activity', { defaultValue: 'Activity' })}
          rules={[
            {
              required: true,
              message: t('taskTimeLogTab.timeLogForm.selectActivityError', {
                defaultValue: 'Select an activity',
              }),
            },
          ]}
        >
          <TimeLogActivitySelect
            size="small"
            aria-label={t('taskTimeLogTab.timeLogForm.activity', { defaultValue: 'Activity' })}
          />
        </Form.Item>

        <Form.Item
          name="date"
          label={t('taskTimeLogTab.timeLogForm.date')}
          rules={[
            {
              required: true,
              message: t('taskTimeLogTab.timeLogForm.selectDateError'),
            },
          ]}
        >
          <DatePicker
            size="small"
            style={{ width: '100%' }}
            disabledDate={isDateDisabled}
          />
        </Form.Item>

        <Form.Item style={{ marginBlockEnd: 6 }}>
          <Flex gap={8} wrap="wrap" style={{ width: '100%' }}>
            <Form.Item
              name="startTime"
              label={t('taskTimeLogTab.timeLogForm.startTime')}
              rules={[
                {
                  required: true,
                  message: t('taskTimeLogTab.timeLogForm.selectStartTimeError'),
                },
              ]}
              style={{ flex: 1, minWidth: 140, marginBlockEnd: 0 }}
            >
              <TimeTextInput
                size="small"
                style={{ width: '100%' }}
                aria-label={t('taskTimeLogTab.timeLogForm.startTime')}
                onComplete={() => endTimeInputRef.current?.focus()}
              />
            </Form.Item>

            <Form.Item
              name="endTime"
              label={t('taskTimeLogTab.timeLogForm.endTime')}
              rules={[
                {
                  required: true,
                  message: t('taskTimeLogTab.timeLogForm.selectEndTimeError'),
                },
              ]}
              style={{ flex: 1, minWidth: 140, marginBlockEnd: 0 }}
            >
              <TimeTextInput
                ref={endTimeInputRef}
                size="small"
                style={{ width: '100%' }}
                aria-label={t('taskTimeLogTab.timeLogForm.endTime')}
              />
            </Form.Item>
          </Flex>
        </Form.Item>

        <TimeRangeDurationHint
          start={formValues.startTime}
          end={formValues.endTime}
          style={{ marginTop: -2, marginBottom: 8 }}
        />

        {/* Reassign to different task — edit mode only */}
        {allowReassign && mode === 'edit' && (
          <>
            <Form.Item
              label={
                <span>
                  {t('taskTimeLogTab.timeLogForm.moveToProject', { defaultValue: 'Move to Project' })}
                  <Tooltip title={t('taskTimeLogTab.timeLogForm.moveToProjectTooltip', { defaultValue: 'Reassign this time log to a different project' })}>
                    <InfoCircleOutlined style={{ marginLeft: 6, color: '#8c8c8c', fontSize: 13 }} />
                  </Tooltip>

                </span>
              }

              style={{ marginBlockEnd: 6 }}
            >


              <Select
                showSearch
                allowClear
                placeholder={t('taskTimeLogTab.timeLogForm.selectProject', { defaultValue: 'Search project...' })}
                filterOption={false}
                loading={reassignProjectLoading}
                onFocus={() => {
                  setReassignProjectSearch('');
                  setReassignProjectSearchResults([]);
                }}
                onSearch={val => setReassignProjectSearch(val)}
                onChange={(val: string | undefined) => {
                  if (!val) {
                    setSelectedReassignProject(null);
                    setSelectedReassignTaskId(null);
                    setReassignTasks([]);
                    return;
                  }
                  const found =
                    reassignProjectSearchResults.find(p => p.id === val) ||
                    reassignProjects.find(p => p.id === val) ||
                    null;
                  setSelectedReassignProject(found);
                  setReassignProjectSearch('');

                  setSelectedReassignTaskId(null);
                  setReassignTasks([]);
                }}
                size="small"
                style={{ width: '100%' }}
                notFoundContent={reassignProjectLoading ? <Spin size="small" /> : null}
                options={reassignProjectSearchResults.map(p => ({ value: p.id, label: p.name }))}

              />
            </Form.Item>

            {selectedReassignProject && (
              <Form.Item
                label={
                  <span>
                    {t('taskTimeLogTab.timeLogForm.moveToTask', { defaultValue: 'Move to Task' })}
                    <Tooltip title={t('taskTimeLogTab.timeLogForm.moveToTaskTooltip', { defaultValue: 'Reassign this time log to a different task' })}>
                      <InfoCircleOutlined style={{ marginLeft: 6, color: '#8c8c8c', fontSize: 13 }} />
                    </Tooltip>

                  </span>
                }

                style={{ marginBlockEnd: 10 }}
              >

                <Select
                  showSearch
                  allowClear
                  placeholder={t('taskTimeLogTab.timeLogForm.selectTask', { defaultValue: 'Select task...' })}
                  filterOption={false}
                  loading={reassignTaskLoading}
                  onSearch={val => setReassignTaskSearch(val)}
                  onChange={(val: string | undefined) => setSelectedReassignTaskId(val || null)}
                  size="small"
                  style={{ width: '100%' }}
                  notFoundContent={reassignTaskLoading ? <Spin size="small" /> : null}
                  options={reassignTasks.map(task => ({ value: task.id, label: task.name }))}
                />
              </Form.Item>
            )}
          </>
        )}


        <Form.Item
          name="description"
          label={t('taskTimeLogTab.timeLogForm.workDescription')}
          style={{ marginBlockEnd: 10 }}
        >
          <Input.TextArea
            placeholder={t('taskTimeLogTab.timeLogForm.descriptionPlaceholder')}
            maxLength={500}
            showCount
            autoSize={{ minRows: 2, maxRows: 6 }}
          />
        </Form.Item>

        <Form.Item style={{ marginBlockEnd: 0 }}>
          <Flex gap={8}>
            <Button onClick={onCancel}>{t('taskTimeLogTab.timeLogForm.cancel')}</Button>
            <Button
              type="primary"
              icon={<ClockCircleOutlined />}
              disabled={!isFormValid()}
              loading={submitting}
              htmlType="submit"
            >
              {mode === 'edit'
                ? t('taskTimeLogTab.timeLogForm.updateTime', { defaultValue: 'Update' })
                : t('taskTimeLogTab.timeLogForm.logTime')}
            </Button>
          </Flex>
        </Form.Item>
      </Form>
    </Flex>
  );
};

export default TimeLogForm;
