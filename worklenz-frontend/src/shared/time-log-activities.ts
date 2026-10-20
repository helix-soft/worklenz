/** Activity types a time log can be tagged with. Must match the backend's TIME_LOG_ACTIVITIES. */
export const TIME_LOG_ACTIVITIES = [
  { value: 'development', defaultLabel: 'Development' },
  { value: 'specification', defaultLabel: 'Specification' },
  { value: 'management', defaultLabel: 'Management' },
  { value: 'testing', defaultLabel: 'Testing' },
  { value: 'support', defaultLabel: 'Support' },
  { value: 'pr', defaultLabel: 'PR' },
  { value: 'meeting', defaultLabel: 'Sync' },
  { value: 'demo', defaultLabel: 'Demo' },
  { value: 'workshop', defaultLabel: 'Workshop' },
  { value: 'training', defaultLabel: 'Training' },
  { value: 'interview', defaultLabel: 'Interview' },
] as const;

export type TimeLogActivity = (typeof TIME_LOG_ACTIVITIES)[number]['value'];

export const isTimeLogActivity = (value: unknown): value is TimeLogActivity =>
  typeof value === 'string' && TIME_LOG_ACTIVITIES.some(item => item.value === value);

export const DEFAULT_TIME_LOG_ACTIVITY: TimeLogActivity = 'development';

/** i18n key (in the `home` namespace) for an activity label. */
export const getTimeLogActivityKey = (activity: string) => `logTime.activities.${activity}`;

export const getTimeLogActivityDefaultLabel = (activity: string): string =>
  TIME_LOG_ACTIVITIES.find(item => item.value === activity)?.defaultLabel ?? activity;
