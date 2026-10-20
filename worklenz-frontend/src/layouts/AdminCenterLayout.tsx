import { Flex, Typography } from '@/shared/antd-imports';
import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useDebouncedMediaQuery } from '@/hooks/useDebouncedMediaQuery';
import AdminCenterSidebar from '@/pages/admin-center/sidebar/sidebar';
import { useTranslation } from 'react-i18next';

const AdminCenterLayout: React.FC = () => {
  const isTablet = useDebouncedMediaQuery({ query: '(min-width:768px)' });
  const { t } = useTranslation('admin-center/sidebar');

  // Reserve the window scrollbar's space while in the Admin Center: otherwise long pages
  // (e.g. Calendar settings) add a scrollbar and the centered layout shifts sideways.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.scrollbarGutter;
    root.style.scrollbarGutter = 'stable';
    return () => {
      root.style.scrollbarGutter = previous;
    };
  }, []);

  return (
    <div className="my-6">
      {isTablet ? (
        <Flex gap={24} align="flex-start" className="w-full">
          {/* Sticky left column — title + sidebar together */}
          <Flex
            vertical
            className="w-full max-w-60 shrink-0"
            // Sticky offset = the column's natural position (52px navbar + 24px margin), so the
            // title doesn't shift by a few pixels depending on how tall the current page is.
            style={{ position: 'sticky', top: STICKY_TOP, height: 'fit-content' }}
          >
            <Typography.Title level={4} style={{ marginBottom: 24 }}>
              {t('adminCenter')}
            </Typography.Title>
            <AdminCenterSidebar />
          </Flex>

          {/* Scrollable content */}
          {/* min-w-0 lets wide pages (tables) scroll inside instead of squeezing the sidebar */}
          <Flex className="w-full min-w-0">
            <Outlet />
          </Flex>
        </Flex>
      ) : (
        <Flex vertical gap={24} className="mt-6">
          <Typography.Title level={4}>{t('adminCenter')}</Typography.Title>
          <AdminCenterSidebar />
          <Outlet />
        </Flex>
      )}
    </div>
  );
};

// Static content
const NAVBAR_HEIGHT = 52;
const STICKY_TOP = NAVBAR_HEIGHT + 24;

export default AdminCenterLayout;
