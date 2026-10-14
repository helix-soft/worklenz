import React from 'react';
import {
  Modal,
  Flex,
  Select,
  DatePicker,
  InputRef,
  Input,
  Form,
  Button,
  Spin,
  appMessage,
  dayjs,
  type Dayjs,
} from '@/shared/antd-imports';
import { useTranslation } from 'react-i18next';
import { TimeTextInput } from '@/components/common/time-text-input/TimeTextInput';
import { getTimeRangeSeconds } from '@/utils/time-text-input';
import { DEFAULT_TIME_LOG_ACTIVITY, TimeLogActivity } from '@/shared/time-log-activities';
import { TimeLogActivitySelect } from '@/components/time-entries/TimeLogActivitySelect';
import { TimeRangeDurationHint } from '@/components/time-entries/TimeRangeDurationHint';
import {
  taskTimeLogsApiService,
  IRecentProject,
  ITaskInProject,
} from '@/api/tasks/task-time-logs.api.service';
import apiClient from '@/api/api-client';
import { API_BASE_URL } from '@/shared/constants';

const { TextArea } = Input;

interface LogTimeModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const LogTimeModal: React.FC<LogTimeModalProps> = ({ open, onClose, onSuccess }) => {
  const { t } = useTranslation('time-entries');
  const [form] = Form.useForm();
  const endTimeInputRef = React.useRef<InputRef>(null);

  const [recentProjects, setRecentProjects] = React.useState<IRecentProject[]>([]);
  const [projectSearchResults, setProjectSearchResults] = React.useState<IRecentProject[]>([]);
  const [projectSearchTerm, setProjectSearchTerm] = React.useState('');
  const [projectLoading, setProjectLoading] = React.useState(false);
  const [selectedProject, setSelectedProject] = React.useState<IRecentProject | null>(null);

  const [tasks, setTasks] = React.useState<ITaskInProject[]>([]);
  const [taskSearchTerm, setTaskSearchTerm] = React.useState('');
  const [taskLoading, setTaskLoading] = React.useState(false);
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);

  const [submitting, setSubmitting] = React.useState(false);
  const [formValues, setFormValues] = React.useState<{
    date?: Dayjs;
    activity?: TimeLogActivity;
    startTime?: Dayjs;
    endTime?: Dayjs;
  }>({});

  const projectSearchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskSearchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const initialValues = {
      date: dayjs(),
      activity: DEFAULT_TIME_LOG_ACTIVITY,
      startTime: dayjs().second(0).millisecond(0),
      endTime: dayjs().second(0).millisecond(0).add(30, 'minute'),
    };
    form.resetFields();
    form.setFieldsValue(initialValues);
    setFormValues(initialValues);
    setSelectedProject(null);
    setSelectedTaskId(null);
    setTasks([]);
    setProjectSearchTerm('');
    setTaskSearchTerm('');
    taskTimeLogsApiService.getMyRecentProjects().then(res => {
      if (res.done) setRecentProjects(res.body as IRecentProject[]);
    });
  }, [open, form]);

  React.useEffect(() => {
    if (projectSearchTimerRef.current) clearTimeout(projectSearchTimerRef.current);
    if (!projectSearchTerm.trim()) {
      setProjectSearchResults([]);
      return;
    }
    projectSearchTimerRef.current = setTimeout(async () => {
      setProjectLoading(true);
      try {
        const res = await apiClient.get(`${API_BASE_URL}/projects/my-task-projects`);
        const list: any[] = res.data?.body || [];
        const q = projectSearchTerm.toLowerCase();
        setProjectSearchResults(
          list
            .filter((p: any) => p.name?.toLowerCase().includes(q))
            .map((p: any) => ({ id: p.id, name: p.name, color_code: p.color_code }))
        );
      } catch {
        setProjectSearchResults([]);
      } finally {
        setProjectLoading(false);
      }
    }, 300);
  }, [projectSearchTerm]);

  React.useEffect(() => {
    if (!selectedProject) return;
    if (taskSearchTimerRef.current) clearTimeout(taskSearchTimerRef.current);
    taskSearchTimerRef.current = setTimeout(async () => {
      setTaskLoading(true);
      try {
        const res = await taskTimeLogsApiService.getMyTasksInProject(selectedProject.id, taskSearchTerm || undefined);
        if (res.done) setTasks(res.body as ITaskInProject[]);
      } catch {
        setTasks([]);
      } finally {
        setTaskLoading(false);
      }
    }, 200);
  }, [selectedProject, taskSearchTerm]);

  React.useEffect(() => () => {
    if (projectSearchTimerRef.current) clearTimeout(projectSearchTimerRef.current);
    if (taskSearchTimerRef.current) clearTimeout(taskSearchTimerRef.current);
  }, []);

  const projectOptions = (projectSearchTerm.trim() ? projectSearchResults : recentProjects).map(p => ({
    value: p.id,
    label: p.name,
  }));

  const taskOptions = tasks.map(task => ({ value: task.id, label: task.name }));

  const handleProjectChange = (projectId: string | undefined) => {
    const found =
      projectSearchResults.find(p => p.id === projectId) ||
      recentProjects.find(p => p.id === projectId) ||
      null;
    setSelectedProject(found);
    setSelectedTaskId(null);
    setTasks([]);
    setTaskSearchTerm('');
    form.setFieldsValue({ taskId: undefined });
  };

  const isFormValid = () => {
    if (!selectedProject || !selectedTaskId || !formValues.activity || !formValues.date) return false;
    return getTimeRangeSeconds(formValues.startTime, formValues.endTime) > 0;
  };

  const handleSubmit = async (values: any) => {
    if (!selectedProject || !selectedTaskId) {
      appMessage.error(t('selectProjectAndTaskError', { defaultValue: 'Please select a project and a task' }));
      return;
    }

    const date: Dayjs = values.date;
    const startTime: Dayjs = values.startTime;
    const secondsSpent = getTimeRangeSeconds(startTime, values.endTime);
    if (!startTime || secondsSpent <= 0) {
      form.setFields([
        {
          name: 'endTime',
          errors: [t('sameStartEndError', { defaultValue: 'Start and end time cannot be the same' })],
        },
      ]);
      return;
    }
    const formattedStart = date.hour(startTime.hour()).minute(startTime.minute()).second(0).millisecond(0);

    const requestBody = {
      id: selectedTaskId,
      project_id: selectedProject.id,
      formatted_start: formattedStart.toISOString(),
      seconds_spent: secondsSpent,
      activity: values.activity,
      description: values.description || '',
    };

    setSubmitting(true);
    try {
      await taskTimeLogsApiService.create(requestBody);
      onSuccess();
      onClose();
    } catch {
      appMessage.error(t('logTimeError', { defaultValue: 'Failed to log time' }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={t('modalTitle', { defaultValue: 'Quick Time Entry' })}
      footer={null}
      width={440}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        onValuesChange={(_changedValues, values) => setFormValues(values)}
        requiredMark={false}
      >
        <Form.Item label={t('projectLabel', { defaultValue: 'Project' })} style={{ marginBottom: 16 }}>
          <Select
            showSearch
            allowClear
            filterOption={false}
            placeholder={t('selectProjectPlaceholder', { defaultValue: 'Select project...' })}
            value={selectedProject?.id}
            options={projectOptions}
            loading={projectLoading}
            notFoundContent={projectLoading ? <Spin size="small" /> : null}
            onSearch={setProjectSearchTerm}
            onChange={handleProjectChange}
            style={{ width: '100%' }}
          />
        </Form.Item>

        <Form.Item name="taskId" label={t('taskLabel', { defaultValue: 'Task' })} style={{ marginBottom: 16 }}>
          <Select
            showSearch
            allowClear
            filterOption={false}
            disabled={!selectedProject}
            placeholder={
              selectedProject
                ? t('selectTaskPlaceholder', { defaultValue: 'Select task...' })
                : t('selectProjectFirstPlaceholder', { defaultValue: 'Select a project first' })
            }
            options={taskOptions}
            loading={taskLoading}
            notFoundContent={taskLoading ? <Spin size="small" /> : null}
            onSearch={setTaskSearchTerm}
            onChange={val => setSelectedTaskId(val || null)}
            style={{ width: '100%' }}
          />
        </Form.Item>

        <Form.Item
          name="activity"
          label={t('activityLabel', { defaultValue: 'Activity' })}
          rules={[{ required: true, message: t('selectActivityError', { defaultValue: 'Select an activity' }) }]}
          style={{ marginBottom: 16 }}
        >
          <TimeLogActivitySelect aria-label={t('activityLabel', { defaultValue: 'Activity' })} />
        </Form.Item>

        <Form.Item
          name="date"
          label={t('dateLabel', { defaultValue: 'Date' })}
          rules={[{ required: true, message: t('selectDateError', { defaultValue: 'Select a date' }) }]}
          style={{ marginBottom: 16 }}
        >
          <DatePicker
            style={{ width: '100%' }}
            disabledDate={current => current && current.toDate() > new Date()}
          />
        </Form.Item>

        <Flex gap={12} style={{ width: '100%' }}>
          <Form.Item
            name="startTime"
            label={t('startTimeLabel', { defaultValue: 'Start Time' })}
            rules={[{ required: true, message: t('selectStartTimeError', { defaultValue: 'Select a start time' }) }]}
            style={{ flex: 1, marginBottom: 16 }}
          >
            <TimeTextInput
              style={{ width: '100%' }}
              aria-label={t('startTimeLabel', { defaultValue: 'Start Time' })}
              onComplete={() => endTimeInputRef.current?.focus()}
            />
          </Form.Item>

          <Form.Item
            name="endTime"
            label={t('endTimeLabel', { defaultValue: 'End Time' })}
            rules={[{ required: true, message: t('selectEndTimeError', { defaultValue: 'Select an end time' }) }]}
            style={{ flex: 1, marginBottom: 16 }}
          >
            <TimeTextInput
              ref={endTimeInputRef}
              style={{ width: '100%' }}
              aria-label={t('endTimeLabel', { defaultValue: 'End Time' })}
            />
          </Form.Item>
        </Flex>
        <TimeRangeDurationHint
          start={formValues.startTime}
          end={formValues.endTime}
          style={{ marginTop: -8, marginBottom: 16 }}
        />

        <Form.Item
          name="description"
          label={t('workDescriptionLabel', { defaultValue: 'Work Description' })}
          style={{ marginBottom: 20 }}
        >
          <TextArea
            placeholder={t('workDescriptionPlaceholder', { defaultValue: 'What did you work on?' })}
            maxLength={500}
            showCount
            autoSize={{ minRows: 2, maxRows: 5 }}
          />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0 }}>
          <Button
            type="primary"
            htmlType="submit"
            block
            size="large"
            loading={submitting}
            disabled={!isFormValid()}
          >
            {t('logTimeButton', { defaultValue: 'Log Time' })}
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
};
