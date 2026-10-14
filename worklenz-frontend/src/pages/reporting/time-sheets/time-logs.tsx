import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Dropdown,
  Flex,
  Result,
  Segmented,
  Tooltip,
  DownOutlined,
  ReloadOutlined,
} from '@/shared/antd-imports';
import CustomPageHeader from '@/components/reporting/common/CustomPageHeader';
import { TimeLogsDateRangePicker } from '@/components/reporting/time-reports/time-logs/TimeLogsDateRangePicker';
import {
  EMPTY_TIME_LOGS_FILTERS,
  ITimeLogsFilterState,
  TimeLogsFilterBar,
} from '@/components/reporting/time-reports/time-logs/TimeLogsFilterBar';
import { TimeLogsSummary } from '@/components/reporting/time-reports/time-logs/TimeLogsSummary';
import { TimeLogsDetailedTable } from '@/components/reporting/time-reports/time-logs/TimeLogsDetailedTable';
import { reportingApiService } from '@/api/reporting/reporting.api.service';
import { reportingExportApiService } from '@/api/reporting/reporting-export.api.service';
import { useDocumentTitle } from '@/hooks/useDoumentTItle';
import {
  IBillableFilter,
  ITimeLogEntry,
  ITimeLogsFilterOptions,
  ITimeLogsFlatRequest,
} from '@/types/reporting/time-logs-report.types';
import { flattenTimeLogGroups, getPresetRange, TimeLogsDateRange } from '@/utils/time-logs-report';
import logger from '@/utils/errorLogger';

type TimeLogsView = 'summary' | 'detailed';

const TimeLogsPage: React.FC = () => {
  const { t } = useTranslation('time-report');
  useDocumentTitle(t('timeLogsReport.pageTitle', { defaultValue: 'Time Logs' }));

  const [searchParams, setSearchParams] = useSearchParams();
  const view: TimeLogsView = searchParams.get('view') === 'detailed' ? 'detailed' : 'summary';

  const [range, setRange] = useState<TimeLogsDateRange>(() => getPresetRange('thisWeek'));
  const [filters, setFilters] = useState<ITimeLogsFilterState>(EMPTY_TIME_LOGS_FILTERS);
  const debouncedDescription = useDebouncedValue(filters.description.trim(), SEARCH_DEBOUNCE_MS);

  const [filterOptions, setFilterOptions] = useState<ITimeLogsFilterOptions>(EMPTY_OPTIONS);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);

  const [entries, setEntries] = useState<ITimeLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const latestRequestId = useRef(0);

  useEffect(() => {
    let isActive = true;
    setIsLoadingOptions(true);
    reportingApiService
      .getTimelogsFilterOptions()
      .then(res => {
        if (isActive && res.done && res.body) setFilterOptions(res.body);
      })
      .catch(error => logger.error('Error fetching time log filter options', error))
      .finally(() => isActive && setIsLoadingOptions(false));
    return () => {
      isActive = false;
    };
  }, []);

  const request: ITimeLogsFlatRequest = useMemo(
    () => ({
      date_range: [range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD')],
      team_member_ids: filters.memberIds,
      project_ids: filters.projectIds,
      client_ids: filters.clientIds,
      billable: toBillableFilter(filters.billable),
      search: debouncedDescription || undefined,
    }),
    [
      range,
      filters.memberIds,
      filters.projectIds,
      filters.clientIds,
      filters.billable,
      debouncedDescription,
    ]
  );

  const fetchLogs = useCallback(async () => {
    const requestId = ++latestRequestId.current;
    setIsLoading(true);
    setHasError(false);
    try {
      const res = await reportingApiService.getTimelogsFlat(request);
      if (requestId !== latestRequestId.current) return;
      if (!res.done) throw new Error(res.message || 'Failed to fetch time logs');
      setEntries(flattenTimeLogGroups(res.body || []));
    } catch (error) {
      if (requestId !== latestRequestId.current) return;
      logger.error('Error fetching time logs', error);
      setEntries([]);
      setHasError(true);
    } finally {
      if (requestId === latestRequestId.current) setIsLoading(false);
    }
  }, [request]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleViewChange = (value: TimeLogsView) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'summary') next.delete('view');
    else next.set('view', value);
    setSearchParams(next, { replace: true });
  };

  const handleExport = (type: 'excel' | 'csv') => {
    const params = {
      date_range: request.date_range,
      billable: request.billable,
      team_member_ids: request.team_member_ids,
      project_ids: request.project_ids,
      client_ids: request.client_ids,
      search: request.search,
    };
    if (type === 'excel') reportingExportApiService.exportTimelogsFlatExcel(params);
    else reportingExportApiService.exportTimelogsFlatCSV(params);
  };

  const refreshLabel = t('timeLogsReport.refresh', { defaultValue: 'Refresh' });

  return (
    <Flex vertical gap={16}>
      <CustomPageHeader
        title={t('timeLogsReport.pageTitle', { defaultValue: 'Time Logs' })}
        style={{ padding: 0 }}
      >
        <Flex wrap gap={8} align="center" style={{ maxWidth: '100%' }}>
          <Segmented<TimeLogsView>
            value={view}
            onChange={handleViewChange}
            options={[
              {
                value: 'summary',
                label: t('timeLogsReport.views.summary', { defaultValue: 'Summary' }),
              },
              {
                value: 'detailed',
                label: t('timeLogsReport.views.detailed', { defaultValue: 'Detailed' }),
              },
            ]}
          />
          <TimeLogsDateRangePicker value={range} onChange={setRange} />
          <Tooltip title={refreshLabel}>
            <Button
              icon={<ReloadOutlined />}
              aria-label={refreshLabel}
              loading={isLoading}
              onClick={fetchLogs}
            />
          </Tooltip>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'excel',
                  label: t('timeLogsReport.exportExcel', { defaultValue: 'Export Excel' }),
                },
                {
                  key: 'csv',
                  label: t('timeLogsReport.exportCsv', { defaultValue: 'Export CSV' }),
                },
              ],
              onClick: ({ key }) => handleExport(key as 'excel' | 'csv'),
            }}
          >
            <Button type="primary" icon={<DownOutlined />} iconPosition="end">
              {t('timeLogsReport.export', { defaultValue: 'Export' })}
            </Button>
          </Dropdown>
        </Flex>
      </CustomPageHeader>

      <TimeLogsFilterBar
        options={filterOptions}
        isLoadingOptions={isLoadingOptions}
        filters={filters}
        onChange={setFilters}
      />

      {hasError ? (
        <Result
          status="error"
          title={t('timeLogsReport.errorTitle', { defaultValue: "Couldn't load time logs" })}
          subTitle={t('timeLogsReport.errorHint', {
            defaultValue: 'Check your connection and try again.',
          })}
          extra={
            <Button type="primary" onClick={fetchLogs}>
              {t('timeLogsReport.retry', { defaultValue: 'Try again' })}
            </Button>
          }
        />
      ) : view === 'summary' ? (
        <TimeLogsSummary entries={entries} range={range} isLoading={isLoading} />
      ) : (
        <TimeLogsDetailedTable entries={entries} isLoading={isLoading} />
      )}
    </Flex>
  );
};

export default TimeLogsPage;

// Helpers
const useDebouncedValue = <T,>(value: T, delayMs: number): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);
  return debounced;
};

const toBillableFilter = (value: ITimeLogsFilterState['billable']): IBillableFilter => ({
  billable: value !== 'nonBillable',
  nonBillable: value !== 'billable',
});

// Static content
const SEARCH_DEBOUNCE_MS = 300;

const EMPTY_OPTIONS: ITimeLogsFilterOptions = { projects: [], clients: [], members: [] };
