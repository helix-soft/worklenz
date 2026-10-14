import React, { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Card, Flex, Input, Select, theme } from '@/shared/antd-imports';
import {
  ITimeLogsFilterOptions,
  NO_CLIENT_FILTER_ID,
} from '@/types/reporting/time-logs-report.types';

export type TimeLogsBillableFilter = 'all' | 'billable' | 'nonBillable';

export interface ITimeLogsFilterState {
  memberIds: string[];
  clientIds: string[];
  projectIds: string[];
  billable: TimeLogsBillableFilter;
  description: string;
}

export const EMPTY_TIME_LOGS_FILTERS: ITimeLogsFilterState = {
  memberIds: [],
  clientIds: [],
  projectIds: [],
  billable: 'all',
  description: '',
};

export const hasActiveTimeLogsFilters = (filters: ITimeLogsFilterState): boolean =>
  filters.memberIds.length > 0 ||
  filters.clientIds.length > 0 ||
  filters.projectIds.length > 0 ||
  filters.billable !== 'all' ||
  filters.description.trim().length > 0;

interface TimeLogsFilterBarProps {
  options: ITimeLogsFilterOptions;
  isLoadingOptions: boolean;
  filters: ITimeLogsFilterState;
  onChange: (filters: ITimeLogsFilterState) => void;
}

/** Clockify-style filter bar: member, client, project, billable status and description. */
export const TimeLogsFilterBar: React.FC<TimeLogsFilterBarProps> = memo(
  ({ options, isLoadingOptions, filters, onChange }) => {
    const { t } = useTranslation('time-report');
    const { token } = theme.useToken();

    const update = (patch: Partial<ITimeLogsFilterState>) => onChange({ ...filters, ...patch });

    const memberOptions = useMemo(
      () =>
        options.members.map(member => ({
          value: member.id,
          label: member.name,
          avatarUrl: member.avatar_url,
        })),
      [options.members]
    );

    const clientOptions = useMemo(
      () => [
        {
          value: NO_CLIENT_FILTER_ID,
          label: t('timeLogsReport.noClient', { defaultValue: 'Without client' }),
        },
        ...options.clients.map(client => ({ value: client.id, label: client.name })),
      ],
      [options.clients, t]
    );

    // Narrow the project list to the selected clients, like Clockify does.
    const projectOptions = useMemo(() => {
      const selectedClients = new Set(filters.clientIds);
      return options.projects
        .filter(
          project =>
            selectedClients.size === 0 ||
            selectedClients.has(project.client_id || NO_CLIENT_FILTER_ID)
        )
        .map(project => ({
          value: project.id,
          label: project.name,
          color: project.color_code || token.colorPrimary,
          clientName: project.client_name,
        }));
    }, [options.projects, filters.clientIds, token.colorPrimary]);

    const handleClientsChange = (clientIds: string[]) => {
      // Drop selected projects that no longer belong to the selected clients
      const allowed = new Set(clientIds);
      const projectIds =
        clientIds.length === 0
          ? filters.projectIds
          : filters.projectIds.filter(id => {
              const project = options.projects.find(p => p.id === id);
              return project && allowed.has(project.client_id || NO_CLIENT_FILTER_ID);
            });
      update({ clientIds, projectIds });
    };

    const selectStyle: React.CSSProperties = { minWidth: 180, flex: '1 1 180px', maxWidth: 280 };

    return (
      <Card size="small" style={{ borderRadius: 8 }} styles={{ body: { padding: 12 } }}>
        <Flex wrap gap={8} align="center">
          <Select
            mode="multiple"
            allowClear
            loading={isLoadingOptions}
            style={selectStyle}
            maxTagCount="responsive"
            placeholder={t('timeLogsReport.filters.members', { defaultValue: 'Team' })}
            aria-label={t('timeLogsReport.filters.members', { defaultValue: 'Team' })}
            value={filters.memberIds}
            onChange={memberIds => update({ memberIds })}
            optionFilterProp="label"
            options={memberOptions}
            optionRender={option => (
              <Flex align="center" gap={8}>
                <Avatar size={20} src={option.data.avatarUrl || undefined}>
                  {option.data.label?.toString().charAt(0).toUpperCase()}
                </Avatar>
                <span>{option.data.label}</span>
              </Flex>
            )}
          />
          <Select
            mode="multiple"
            allowClear
            loading={isLoadingOptions}
            style={selectStyle}
            maxTagCount="responsive"
            placeholder={t('timeLogsReport.filters.clients', { defaultValue: 'Client' })}
            aria-label={t('timeLogsReport.filters.clients', { defaultValue: 'Client' })}
            value={filters.clientIds}
            onChange={handleClientsChange}
            optionFilterProp="label"
            options={clientOptions}
          />
          <Select
            mode="multiple"
            allowClear
            loading={isLoadingOptions}
            style={selectStyle}
            maxTagCount="responsive"
            placeholder={t('timeLogsReport.filters.projects', { defaultValue: 'Project' })}
            aria-label={t('timeLogsReport.filters.projects', { defaultValue: 'Project' })}
            value={filters.projectIds}
            onChange={projectIds => update({ projectIds })}
            optionFilterProp="label"
            options={projectOptions}
            optionRender={option => (
              <Flex align="center" gap={8}>
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: option.data.color,
                    flexShrink: 0,
                  }}
                />
                <span>{option.data.label}</span>
                {option.data.clientName && (
                  <span style={{ color: token.colorTextSecondary }}>
                    - {option.data.clientName}
                  </span>
                )}
              </Flex>
            )}
          />
          <Select
            style={{ ...selectStyle, minWidth: 160 }}
            aria-label={t('timeLogsReport.filters.billable', { defaultValue: 'Billable status' })}
            value={filters.billable}
            onChange={billable => update({ billable })}
            options={[
              {
                value: 'all',
                label: t('timeLogsReport.filters.allBillable', {
                  defaultValue: 'Billable & non-billable',
                }),
              },
              {
                value: 'billable',
                label: t('timeLogsReport.filters.billableOnly', { defaultValue: 'Billable' }),
              },
              {
                value: 'nonBillable',
                label: t('timeLogsReport.filters.nonBillableOnly', {
                  defaultValue: 'Non-billable',
                }),
              },
            ]}
          />
          <Input.Search
            allowClear
            style={{ ...selectStyle, maxWidth: 320 }}
            placeholder={t('timeLogsReport.filters.description', {
              defaultValue: 'Search description, task, project...',
            })}
            aria-label={t('timeLogsReport.filters.description', {
              defaultValue: 'Search description, task, project...',
            })}
            value={filters.description}
            onChange={e => update({ description: e.target.value })}
          />
          {hasActiveTimeLogsFilters(filters) && (
            <Button type="link" onClick={() => onChange(EMPTY_TIME_LOGS_FILTERS)}>
              {t('timeLogsReport.filters.clear', { defaultValue: 'Clear filters' })}
            </Button>
          )}
        </Flex>
      </Card>
    );
  }
);

TimeLogsFilterBar.displayName = 'TimeLogsFilterBar';
