import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import { HomeOutlined } from '@ant-design/icons';
import { BankOutlined, Button, Flex, Modal, Typography } from '@/shared/antd-imports';
import { leaveApiService } from '@/api/leave/leave.api.service';
import { WorkLocation } from '@/types/leave/leave.types';
import logger from '@/utils/errorLogger';

/**
 * Daily "where do you work today?" prompt. Until the member answers for today, it comes back on
 * app load and every time they open Home; "Later" only closes it for the moment.
 * Answers can be changed in Settings → My leave.
 */
export const WorkLocationCheckIn = memo(() => {
  const { t } = useTranslation('leave');
  const [isOpen, setIsOpen] = useState(false);
  const [savingLocation, setSavingLocation] = useState<WorkLocation | null>(null);
  const { pathname } = useLocation();
  const isHome = pathname.startsWith(HOME_PATH);

  const checkToday = useCallback(async () => {
    const today = dayjs().format('YYYY-MM-DD');
    try {
      const res = await leaveApiService.getTodayLocation(today);
      setIsOpen(!!res.done && res.body.should_ask);
    } catch (error) {
      logger.error('Error checking today work location', error);
    }
  }, []);

  useEffect(() => {
    window.addEventListener(WORK_LOCATION_CHANGED_EVENT, checkToday);
    return () => window.removeEventListener(WORK_LOCATION_CHANGED_EVENT, checkToday);
  }, [checkToday]);

  // Ask once when the app loads, and again on every visit to Home until today's location is set.
  const hasCheckedRef = useRef(false);
  useEffect(() => {
    if (!isHome && hasCheckedRef.current) return;
    hasCheckedRef.current = true;
    checkToday();
  }, [isHome, pathname, checkToday]);

  const handleSelect = async (location: WorkLocation) => {
    setSavingLocation(location);
    try {
      const res = await leaveApiService.setLocation(dayjs().format('YYYY-MM-DD'), location);
      if (res.done) setIsOpen(false);
    } catch (error) {
      logger.error('Error saving today work location', error);
    } finally {
      setSavingLocation(null);
    }
  };

  const handleLater = () => setIsOpen(false);

  return (
    <Modal
      open={isOpen}
      title={t('checkIn.title', { defaultValue: 'Where are you working today?' })}
      onCancel={handleLater}
      footer={
        <Button type="text" onClick={handleLater}>
          {t('checkIn.later', { defaultValue: 'Ask me later' })}
        </Button>
      }
      width={420}
      centered
    >
      <Flex vertical gap={16}>
        <Typography.Text type="secondary">
          {t('checkIn.description', {
            defaultValue: 'Your answer is used for the monthly attendance and meal voucher count.',
          })}
        </Typography.Text>
        <Flex gap={12}>
          <Button
            size="large"
            block
            icon={<BankOutlined />}
            loading={savingLocation === 'office'}
            disabled={!!savingLocation}
            onClick={() => handleSelect('office')}
          >
            {t('location.office', { defaultValue: 'Office' })}
          </Button>
          <Button
            size="large"
            block
            icon={<HomeOutlined />}
            loading={savingLocation === 'remote'}
            disabled={!!savingLocation}
            onClick={() => handleSelect('remote')}
          >
            {t('location.remote', { defaultValue: 'Remote' })}
          </Button>
        </Flex>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('checkIn.changeHint', { defaultValue: 'Picked the wrong one? You can change it in' })}{' '}
          <Link to="/worklenz/settings/my-leave" onClick={handleLater}>
            {t('checkIn.changeLink', { defaultValue: 'Settings → My leave' })}
          </Link>
        </Typography.Text>
      </Flex>
    </Modal>
  );
});

WorkLocationCheckIn.displayName = 'WorkLocationCheckIn';

/** Lets other screens (e.g. My leave) tell the prompt that today's answer changed. */
export const notifyWorkLocationChanged = () => {
  window.dispatchEvent(new Event(WORK_LOCATION_CHANGED_EVENT));
};

const WORK_LOCATION_CHANGED_EVENT = 'worklenz:work-location-changed';
const HOME_PATH = '/worklenz/home';
