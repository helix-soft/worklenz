import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Alert,
  Button,
  Card,
  Flex,
  Popconfirm,
  Skeleton,
  Tag,
  Typography,
  message,
} from '@/shared/antd-imports';
import { SyncOutlined } from '@ant-design/icons';
import { GoogleCalendarIcon } from '@/components/settings/integrations/IntegrationIcons';
import { googleCalendarApiService } from '@/api/google-calendar/google-calendar.api.service';
import { IGoogleCalendarStatus } from '@/types/google-calendar.types';
import logger from '@/utils/errorLogger';

/** Settings → Integrations card for the user's own read-only Google Calendar connection. */
export const GoogleCalendarIntegration = () => {
  const { t } = useTranslation('settings/integrations');
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState<IGoogleCalendarStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await googleCalendarApiService.getStatus();
      if (res.done) setStatus(res.body);
    } catch (error) {
      logger.error('Error fetching Google Calendar status', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Result of the OAuth round trip (?googleCalendar=connected|error), shown once.
  useEffect(() => {
    const result = searchParams.get('googleCalendar');
    if (!result) return;
    if (result === 'connected') {
      message.success(
        t('googleCalendar.connectedMessage', { defaultValue: 'Google Calendar connected' })
      );
    } else {
      message.error(
        t('googleCalendar.connectError', {
          defaultValue: 'Could not connect Google Calendar. Please try again.',
        })
      );
    }
    const next = new URLSearchParams(searchParams);
    next.delete('googleCalendar');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const res = await googleCalendarApiService.getAuthUrl();
      if (res.done && res.body?.url) window.location.href = res.body.url;
      else setIsConnecting(false);
    } catch (error) {
      logger.error('Error starting Google Calendar connection', error);
      setIsConnecting(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await googleCalendarApiService.sync();
      if (res.done) setStatus(res.body);
    } catch (error) {
      logger.error('Error syncing Google Calendar', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      const res = await googleCalendarApiService.disconnect();
      if (res.done) await fetchStatus();
    } catch (error) {
      logger.error('Error disconnecting Google Calendar', error);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const needsReauth = status?.status === 'needs_reauth';

  return (
    <Card
      className="text-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow duration-200"
      styles={{ body: { padding: '32px 24px', height: '100%' } }}
    >
      <div className="flex flex-col items-center justify-between h-full">
        <div className="text-6xl text-gray-400 dark:text-gray-500 mb-6">
          <GoogleCalendarIcon />
        </div>

        <div className="flex-1 flex flex-col justify-center w-full">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            {t('googleCalendar.title', { defaultValue: 'Google Calendar' })}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-6 max-w-sm mx-auto">
            {t('googleCalendar.readOnlyDescription', {
              defaultValue:
                'Show the events of your Google calendars on Home → Calendar. Read-only: nothing is changed in Google.',
            })}
          </p>

          {isLoading ? (
            <Skeleton active paragraph={{ rows: 1 }} title={false} />
          ) : status?.connected ? (
            <Flex vertical gap={8} align="center" style={{ marginBottom: 16 }}>
              <Tag color={needsReauth ? 'warning' : 'success'}>
                {needsReauth
                  ? t('googleCalendar.needsReconnect', { defaultValue: 'Needs reconnect' })
                  : t('googleCalendar.connected', { defaultValue: 'Connected' })}
              </Tag>
              {status.google_email && (
                <Typography.Text strong>{status.google_email}</Typography.Text>
              )}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {status.last_synced_at
                  ? t('googleCalendar.lastSynced', {
                      defaultValue: 'Last synced: {{date}} · {{count}} calendars',
                      date: dayjs(status.last_synced_at).format('YYYY-MM-DD HH:mm'),
                      count: status.calendars_count,
                    })
                  : t('googleCalendar.notSyncedYet', { defaultValue: 'Not synced yet' })}
              </Typography.Text>
              {needsReauth && (
                <Alert
                  type="warning"
                  showIcon
                  message={t('googleCalendar.reauthHint', {
                    defaultValue:
                      'Google access expired or was revoked. Connect again to continue syncing.',
                  })}
                />
              )}
              {!needsReauth && status.last_sync_error && (
                <Typography.Text type="danger" style={{ fontSize: 12 }}>
                  {t('googleCalendar.syncError', {
                    defaultValue: 'Last sync failed. Try again later.',
                  })}
                </Typography.Text>
              )}
            </Flex>
          ) : (
            !status?.configured && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16, textAlign: 'left' }}
                message={t('googleCalendar.notConfigured', {
                  defaultValue:
                    'Google Calendar is not configured on this server yet. Ask your administrator.',
                })}
              />
            )
          )}
        </div>

        <div className="w-full">
          {status?.connected ? (
            <Flex gap={8}>
              {needsReauth ? (
                <Button
                  type="primary"
                  size="large"
                  block
                  loading={isConnecting}
                  onClick={handleConnect}
                >
                  {t('googleCalendar.reconnect', { defaultValue: 'Reconnect' })}
                </Button>
              ) : (
                <Button
                  size="large"
                  block
                  icon={<SyncOutlined />}
                  loading={isSyncing}
                  onClick={handleSync}
                >
                  {t('googleCalendar.syncNow', { defaultValue: 'Sync now' })}
                </Button>
              )}
              <Popconfirm
                title={t('googleCalendar.disconnectConfirm', {
                  defaultValue:
                    'Disconnect Google Calendar? Synced events are removed from Worklenz.',
                })}
                okText={t('googleCalendar.disconnect', { defaultValue: 'Disconnect' })}
                okButtonProps={{ danger: true }}
                cancelText={t('cancel', { defaultValue: 'Cancel' })}
                onConfirm={handleDisconnect}
              >
                <Button size="large" danger block loading={isDisconnecting}>
                  {t('googleCalendar.disconnect', { defaultValue: 'Disconnect' })}
                </Button>
              </Popconfirm>
            </Flex>
          ) : (
            <Button
              type="primary"
              size="large"
              className="w-full h-12 text-base font-medium"
              disabled={isLoading || !status?.configured}
              loading={isConnecting}
              onClick={handleConnect}
            >
              {t('connect', { defaultValue: 'Connect' })}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};
