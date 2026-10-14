import React, { memo, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  ChartOptions,
  LinearScale,
  Plugin,
  Tooltip as ChartTooltip,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { theme } from '@/shared/antd-imports';
import { ITimeLogsBucket, ITimeLogsGroupNode } from '@/types/reporting/time-logs-report.types';
import { formatDurationClock, TIME_LOGS_OTHER_COLOR } from '@/utils/time-logs-report';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, ChartTooltip);

interface TimeLogsBarChartProps {
  buckets: ITimeLogsBucket[];
  /** Primary groups, already sorted by logged time; their colors are used for stacking. */
  groups: ITimeLogsGroupNode[];
  getGroupLabel: (node: ITimeLogsGroupNode) => string;
}

/** Stacked bar chart of logged time per day/week/month with totals above each bar. */
export const TimeLogsBarChart: React.FC<TimeLogsBarChartProps> = memo(
  ({ buckets, groups, getGroupLabel }) => {
    const { t } = useTranslation('time-report');
    const { token } = theme.useToken();

    const data = useMemo(() => {
      const visible = groups.slice(0, MAX_CHART_SERIES);
      const hidden = groups.slice(MAX_CHART_SERIES);

      const datasets = visible.map(group => ({
        label: getGroupLabel(group),
        data: buckets.map(bucket => toHours(bucket.byGroup[group.groupKey] || 0)),
        backgroundColor: group.color,
        stack: 'time',
        maxBarThickness: 96,
        borderRadius: 2,
      }));

      if (hidden.length) {
        datasets.push({
          label: t('timeLogsReport.other', { defaultValue: 'Other' }),
          data: buckets.map(bucket =>
            toHours(hidden.reduce((sum, group) => sum + (bucket.byGroup[group.groupKey] || 0), 0))
          ),
          backgroundColor: TIME_LOGS_OTHER_COLOR,
          stack: 'time',
          maxBarThickness: 96,
          borderRadius: 2,
        });
      }

      return {
        labels: buckets.map(bucket => formatBucketLabel(bucket, t)),
        datasets,
      };
    }, [buckets, groups, getGroupLabel, t]);

    // react-chartjs-2 registers plugins only on mount, so the plugin reads the latest values from a ref.
    const latest = useRef({ buckets, token });
    latest.current = { buckets, token };

    const totalsPlugin = useMemo<Plugin<'bar'>>(
      () => ({
        id: 'timeLogsBarTotals',
        afterDatasetsDraw: chart => {
          const { buckets, token } = latest.current;
          const { ctx } = chart;
          if (!chart.data.datasets.length) return;
          const lastMeta = chart.getDatasetMeta(chart.data.datasets.length - 1);
          if (!lastMeta) return;
          ctx.save();
          ctx.font = `500 12px ${token.fontFamily}`;
          ctx.fillStyle = token.colorText;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          buckets.forEach((bucket, index) => {
            const bar = lastMeta.data[index] as unknown as { x: number; y: number; width: number };
            if (!bar) return;
            // Empty periods only get a label when there is room for it
            if (bucket.seconds === 0 && bar.width < MIN_LABEL_BAR_WIDTH) return;
            // Find the top of the stack across all datasets
            let top = bar.y;
            chart.data.datasets.forEach((_, datasetIndex) => {
              const element = chart.getDatasetMeta(datasetIndex).data[index];
              if (element && element.y < top) top = element.y;
            });
            ctx.fillText(formatDurationClock(bucket.seconds), bar.x, top - 4);
          });
          ctx.restore();
        },
      }),
      []
    );

    const options = useMemo<ChartOptions<'bar'>>(
      () => ({
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 200 },
        layout: { padding: { top: 24 } },
        plugins: {
          legend: { display: false },
          datalabels: { display: false },
          tooltip: {
            callbacks: {
              label: item =>
                `${item.dataset.label}: ${formatDurationClock(Number(item.raw) * 3600)}`,
              footer: items =>
                `${t('timeLogsReport.total', { defaultValue: 'Total' })}: ${formatDurationClock(
                  buckets[items[0]?.dataIndex ?? 0]?.seconds || 0
                )}`,
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { color: token.colorTextSecondary, maxRotation: 0, autoSkip: true },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            grid: { color: token.colorBorderSecondary },
            border: { display: false },
            ticks: {
              color: token.colorTextSecondary,
              callback: value => `${value}h`,
            },
          },
        },
      }),
      [buckets, t, token.colorBorderSecondary, token.colorTextSecondary]
    );

    return (
      <div
        style={{ height: 300, width: '100%' }}
        role="img"
        aria-label={t('timeLogsReport.barChartLabel', {
          defaultValue: 'Logged time per period',
        })}
      >
        <Bar data={data} options={options} plugins={[totalsPlugin]} />
      </div>
    );
  }
);

TimeLogsBarChart.displayName = 'TimeLogsBarChart';

interface TimeLogsDonutChartProps {
  groups: ITimeLogsGroupNode[];
  totalSeconds: number;
  getGroupLabel: (node: ITimeLogsGroupNode) => string;
}

/** Donut chart of the share of each primary group, with the total in the middle. */
export const TimeLogsDonutChart: React.FC<TimeLogsDonutChartProps> = memo(
  ({ groups, totalSeconds, getGroupLabel }) => {
    const { t } = useTranslation('time-report');
    const { token } = theme.useToken();

    const data = useMemo(() => {
      const visible = groups.slice(0, MAX_CHART_SERIES);
      const hiddenSeconds = groups
        .slice(MAX_CHART_SERIES)
        .reduce((sum, group) => sum + group.seconds, 0);

      const labels = visible.map(getGroupLabel);
      const values = visible.map(group => toHours(group.seconds));
      const colors = visible.map(group => group.color);
      if (hiddenSeconds > 0) {
        labels.push(t('timeLogsReport.other', { defaultValue: 'Other' }));
        values.push(toHours(hiddenSeconds));
        colors.push(TIME_LOGS_OTHER_COLOR);
      }

      return {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: colors,
            borderColor: token.colorBgContainer,
            borderWidth: 2,
          },
        ],
      };
    }, [groups, getGroupLabel, t, token.colorBgContainer]);

    // react-chartjs-2 registers plugins only on mount, so the plugin reads the latest values from a ref.
    const latest = useRef({ totalSeconds, token });
    latest.current = { totalSeconds, token };

    const centerTextPlugin = useMemo<Plugin<'doughnut'>>(
      () => ({
        id: 'timeLogsDonutCenter',
        afterDraw: chart => {
          const { totalSeconds, token } = latest.current;
          const { ctx, chartArea } = chart;
          if (!chartArea) return;
          ctx.save();
          ctx.font = `600 20px ${token.fontFamily}`;
          ctx.fillStyle = token.colorText;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            formatDurationClock(totalSeconds),
            (chartArea.left + chartArea.right) / 2,
            (chartArea.top + chartArea.bottom) / 2
          );
          ctx.restore();
        },
      }),
      []
    );

    const options = useMemo<ChartOptions<'doughnut'>>(
      () => ({
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        animation: { duration: 200 },
        plugins: {
          legend: { display: false },
          datalabels: { display: false },
          tooltip: {
            callbacks: {
              label: item => {
                const seconds = Number(item.raw) * 3600;
                const percent = totalSeconds > 0 ? (seconds / totalSeconds) * 100 : 0;
                return `${item.label}: ${formatDurationClock(seconds)} (${percent.toFixed(1)}%)`;
              },
            },
          },
        },
      }),
      [totalSeconds]
    );

    return (
      <div
        style={{ height: 260, width: '100%' }}
        role="img"
        aria-label={t('timeLogsReport.donutChartLabel', {
          defaultValue: 'Share of logged time by group',
        })}
      >
        <Doughnut data={data} options={options} plugins={[centerTextPlugin]} />
      </div>
    );
  }
);

TimeLogsDonutChart.displayName = 'TimeLogsDonutChart';

// Helpers
const toHours = (seconds: number) => Number((seconds / 3600).toFixed(2));

const formatBucketLabel = (
  bucket: ITimeLogsBucket,
  t: (key: string, options: Record<string, unknown>) => string
): string => {
  const start = dayjs(bucket.start);
  if (bucket.granularity === 'month') return start.format('MMM YYYY');
  if (bucket.granularity === 'week') {
    return t('timeLogsReport.weekOf', {
      defaultValue: 'Week of {{date}}',
      date: start.format('MMM D'),
    });
  }
  return start.format('ddd, MMM D');
};

// Static content
const MAX_CHART_SERIES = 9;
const MIN_LABEL_BAR_WIDTH = 40;
