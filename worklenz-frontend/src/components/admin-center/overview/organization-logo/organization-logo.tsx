import React, { useState, useRef, useEffect } from 'react';
import {
  Flex,
  Typography,
  Spin,
  message,
  Tooltip,
  Button,
  Popconfirm,
  Popover,
  theme,
} from '@/shared/antd-imports';
import {
  LoadingOutlined,
  PlusOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
} from '@/shared/antd-imports';
import { TFunction } from 'i18next';
import { getBase64 } from '@/utils/file-utils';
import { adminCenterApiService } from '@/api/admin-center/admin-center.api.service';
import logger from '@/utils/errorLogger';
import { IOrganization } from '@/types/admin-center/admin-center.types';
import { hasBusinessFeatureAccess } from '@/ee/utils/subscription-utils';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import { openUpgradeModal, setOrganizationLogo } from '@/features/admin-center/admin-center.slice';
import { useAuthService } from '@/hooks/useAuth';
import { useAppSumoTracking } from '@/ee/hooks/useAppSumoTracking';
import { AppSumoUpsellEvents } from '@/types/mixpanel-events.types';

interface OrganizationLogoProps {
  themeMode: string;
  organization: IOrganization | null;
  t: TFunction;
  refetch: () => void;
}

const OrganizationLogo: React.FC<OrganizationLogoProps> = ({
  organization,
  t,
  refetch,
}) => {
  const dispatch = useAppDispatch();
  const { token } = theme.useToken();
  const currentSession = useAuthService().getCurrentSession();
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isUpgradePopoverOpen, setIsUpgradePopoverOpen] = useState(false);
  const { trackAppSumoEvent } = useAppSumoTracking();
  const isAppSumoUser = String(currentSession?.subscription_type || '').toLowerCase().includes('appsumo');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(
    null
  );
  const [fileSize, setFileSize] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasLogoFeatureAccess = hasBusinessFeatureAccess(currentSession);

  useEffect(() => {
    if (organization?.logo_url) {
      setPreviewUrl(organization.logo_url);
    } else {
      setPreviewUrl(null);
    }
  }, [organization?.logo_url]);

  const validateImage = (file: File): { valid: boolean; warning?: string } => {
    // Check file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return { valid: false, warning: t('logoInvalidFormat') };
    }

    // Check file size (5MB max)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return { valid: false, warning: t('logoFileTooLarge') };
    }

    // Warn if file is large
    const recommendedSize = 500 * 1024; // 500KB
    if (file.size > recommendedSize) {
      return { valid: true, warning: t('logoFileSizeWarning') };
    }

    return { valid: true };
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (uploading || !event.target.files || event.target.files.length === 0) return;

    if (!hasLogoFeatureAccess) {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    const file = event.target.files[0];
    const validation = validateImage(file);

    if (!validation.valid) {
      message.error(validation.warning);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setUploading(true);

    try {
      // Validate image dimensions before uploading. Large logos are scaled down to fit
      // MAX_LOGO_WIDTH × MAX_LOGO_HEIGHT (keeping the aspect ratio) instead of being rejected.
      const objectUrl = URL.createObjectURL(file);
      const img = await loadImage(objectUrl).finally(() => URL.revokeObjectURL(objectUrl));

      const dimensionErrors: string[] = [];
      if (img.width < 200 || img.height < 60) {
        dimensionErrors.push(t('logoTooSmall'));
      }
      if (img.height / img.width > 2) {
        dimensionErrors.push(t('logoVerticalWarning'));
      }

      // Block upload if dimension/aspect ratio validation fails
      if (dimensionErrors.length > 0) {
        dimensionErrors.forEach(err => message.error(err));
        return;
      }

      const original = (await getBase64(file)) as string;
      const scale = Math.min(1, MAX_LOGO_WIDTH / img.width, MAX_LOGO_HEIGHT / img.height);
      const base64 = scale < 1 ? scaleImage(img, scale) : original;
      setImageDimensions({
        width: Math.round(img.width * scale),
        height: Math.round(img.height * scale),
      });
      setFileSize(Math.round(((base64.length - base64.indexOf(',') - 1) * 3) / 4));

      // Show file size warning (non-blocking) after dimension checks pass
      if (validation.warning && scale === 1) {
        message.warning(validation.warning);
      }

      // Upload logo
      const res = await adminCenterApiService.uploadOrganizationLogo(base64);

      if (res.done) {
        const newLogoUrl = res.body?.logo_url || null;
        setPreviewUrl(newLogoUrl);
        dispatch(setOrganizationLogo(newLogoUrl));
        refetch();
      } else {
        logger.error('Error uploading logo', res.message);
      }
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message || error?.message || t('logoUploadError');
      message.error(errorMessage);
      logger.error('Error uploading logo', errorMessage);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveLogo = async () => {
    if (deleting || !previewUrl) return;

    if (!hasLogoFeatureAccess) {
      return;
    }

    setDeleting(true);
    try {
      const res = await adminCenterApiService.deleteOrganizationLogo();

      if (res.done) {
        setPreviewUrl(null);
        dispatch(setOrganizationLogo(null));
        refetch();
      } else {
        logger.error('Error deleting logo', res.message);
      }
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message || error?.message || t('logoRemoveError');
      message.error(errorMessage);
      logger.error('Error deleting logo', error);
    } finally {
      setDeleting(false);
    }
  };

  const triggerFileInput = () => {
    if (uploading) return;
    fileInputRef.current?.click();
  };

  const handleChangeLogoClick = () => {
    if (!hasLogoFeatureAccess) {
      setIsUpgradePopoverOpen(true);
      if (isAppSumoUser) {
        trackAppSumoEvent(AppSumoUpsellEvents.ORG_LOGO_GATED_CLICK, { feature: 'org_logo' });
        trackAppSumoEvent(AppSumoUpsellEvents.UPGRADE_PROMPT_SHOWN, { feature: 'org_logo' });
      }
      return;
    }

    triggerFileInput();
  };

  const handleUpgradeNowClick = () => {
    setIsUpgradePopoverOpen(false);
    if (isAppSumoUser) {
      trackAppSumoEvent(AppSumoUpsellEvents.UPGRADE_NOW_CLICKED, { feature: 'org_logo' });
    }
    dispatch(openUpgradeModal('customOrganizationLogo'));
  };

  const changeLogoUpgradePopoverContent = (
    <Flex vertical gap={12} style={{ maxWidth: 280 }}>
      <Typography.Text>
        {t('customLogoUpgradePopoverBody', {
          defaultValue: t('customLogoUpgradePopoverBody'),
        })}
      </Typography.Text>
      <Button type="primary" onClick={handleUpgradeNowClick}>
        {t('customLogoUpgradePopoverCta', { defaultValue: t('customLogoUpgradePopoverCta') })}
      </Button>
    </Flex>
  );

  const logoPreview = (
    <div
      className="logo-uploader"
      role={hasLogoFeatureAccess ? 'button' : undefined}
      tabIndex={hasLogoFeatureAccess ? 0 : undefined}
      aria-label={previewUrl ? t('changeLogo') : t('uploadLogo')}
      onClick={hasLogoFeatureAccess ? triggerFileInput : undefined}
      onKeyDown={event => {
        if (hasLogoFeatureAccess && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          triggerFileInput();
        }
      }}
      style={{
        // Landscape, like the navbar slot the logo is shown in.
        width: '100%',
        maxWidth: 360,
        height: 104,
        cursor: uploading ? 'wait' : hasLogoFeatureAccess ? 'pointer' : 'not-allowed',
        position: 'relative',
        border: `${previewUrl ? 1 : 2}px ${previewUrl ? 'solid' : 'dashed'} ${token.colorBorder}`,
        borderRadius: token.borderRadiusLG,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: token.colorFillQuaternary,
        transition: 'border-color 0.2s ease, background-color 0.2s ease',
        overflow: 'hidden',
        opacity: hasLogoFeatureAccess ? 1 : 0.7,
      }}
      onMouseEnter={e => {
        if (!uploading && hasLogoFeatureAccess) {
          e.currentTarget.style.borderColor = token.colorPrimary;
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = token.colorBorder;
      }}
    >
      {uploading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: token.colorBgMask,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1,
          }}
        >
          <Spin indicator={<LoadingOutlined style={{ fontSize: 24, color: token.colorWhite }} spin />} />
        </div>
      )}

      {!hasLogoFeatureAccess && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 2,
            backgroundColor: token.colorFillSecondary,
            borderRadius: '50%',
            padding: '4px',
            display: 'flex',
          }}
        >
          <Tooltip title={t('availableOnPaidPlans')}>
            <InfoCircleOutlined style={{ color: token.colorTextTertiary }} />
          </Tooltip>
        </div>
      )}

      {previewUrl ? (
        <img
          src={previewUrl}
          alt={t('logoAltText')}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
            padding: '16px 20px',
            boxSizing: 'border-box',
          }}
        />
      ) : (
        <Flex align="center" justify="center" gap={12} style={{ height: '100%', padding: '16px' }}>
          <div
            style={{
              width: 40,
              height: 40,
              flexShrink: 0,
              borderRadius: '50%',
              backgroundColor: token.colorPrimaryBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <PlusOutlined style={{ fontSize: 18, color: token.colorPrimary }} />
          </div>
          <Flex vertical gap={2}>
            <Typography.Text style={{ fontSize: 13 }}>{t('uploadLogo')}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {t('logoSupportedFormats')}
            </Typography.Text>
          </Flex>
        </Flex>
      )}
    </div>
  );

  // How the logo looks in the navbar (26px high) on the light and the dark theme.
  const navbarPreview = previewUrl && (
    <Flex vertical gap={6} style={{ maxWidth: 360 }}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {t('logoNavbarPreview', { defaultValue: 'Navbar preview' })}
      </Typography.Text>
      <Flex gap={8}>
        {NAVBAR_PREVIEW_THEMES.map(variant => (
          <Tooltip
            key={variant}
            title={
              variant === 'light'
                ? t('logoPreviewLight', { defaultValue: 'Light theme' })
                : t('logoPreviewDark', { defaultValue: 'Dark theme' })
            }
          >
            <div
              style={{
                flex: 1,
                height: 44,
                display: 'flex',
                alignItems: 'center',
                padding: '0 12px',
                borderRadius: token.borderRadius,
                border: `1px solid ${token.colorBorderSecondary}`,
                // Fixed navbar backgrounds: this shows both themes regardless of the current one.
                background: variant === 'light' ? NAVBAR_BG_LIGHT : NAVBAR_BG_DARK,
              }}
            >
              <img
                src={previewUrl}
                alt=""
                style={{ height: 26, maxWidth: 140, objectFit: 'contain', display: 'block' }}
              />
            </div>
          </Tooltip>
        ))}
      </Flex>
    </Flex>
  );

  return (
    <div style={{ width: '100%' }}>
      <Flex justify="space-between" align="flex-start" style={{ width: '100%' }}>
        <Flex vertical gap={16} style={{ flex: 1 }}>
          <Flex align="center" gap={8}>
            <Typography.Title level={5} style={{ margin: 0 }}>
              {t('logo')}
            </Typography.Title>
            <Tooltip title={t('logoFormatRecommendation')}>
              <InfoCircleOutlined
                style={{ color: token.colorTextTertiary, cursor: 'help' }}
              />
            </Tooltip>
          </Flex>

          <Flex vertical gap={12}>
            {logoPreview}
            {navbarPreview}

            {previewUrl && (
              <Flex gap={8} wrap="wrap">
                {!hasLogoFeatureAccess ? (
                  <Popover
                    open={isUpgradePopoverOpen}
                    trigger="click"
                    placement="bottomLeft"
                    onOpenChange={open => {
                      setIsUpgradePopoverOpen(open);
                      if (!open && isAppSumoUser) {
                        trackAppSumoEvent(AppSumoUpsellEvents.UPGRADE_PROMPT_DISMISSED, { feature: 'org_logo' });
                      }
                    }}
                    title={
                      <Flex align="center" justify="space-between" style={{ width: '100%' }}>
                        <Typography.Text strong>
                          {t('customLogoUpgradePopoverTitle', {
                            defaultValue: t('customLogoUpgradePopoverTitle'),
                          })}
                        </Typography.Text>
                        <Button
                          type="text"
                          size="small"
                          aria-label={t('closePopover', { defaultValue: t('closePopover') })}
                          onClick={event => {
                            event.stopPropagation();
                            setIsUpgradePopoverOpen(false);
                          }}
                        >
                          ×
                        </Button>
                      </Flex>
                    }
                    content={changeLogoUpgradePopoverContent}
                  >
                    <Button
                      size="small"
                      onClick={handleChangeLogoClick}
                      disabled={uploading || deleting}
                      type="default"
                    >
                      {t('changeLogo', { defaultValue: t('changeLogo') })}
                    </Button>
                  </Popover>
                ) : (
                  <Button
                    size="small"
                    onClick={handleChangeLogoClick}
                    disabled={uploading || deleting}
                    type="default"
                  >
                    {t('changeLogo', { defaultValue: t('changeLogo') })}
                  </Button>
                )}
                <Popconfirm
                  title={t('removeLogo')}
                  description={t('logoDeleteConfirm')}
                  onConfirm={handleRemoveLogo}
                  okText={t('yes')}
                  cancelText={t('no')}
                  okButtonProps={{ loading: deleting, danger: true }}
                >
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={uploading || deleting}
                    loading={deleting}
                  >
                    {t('removeLogo')}
                  </Button>
                </Popconfirm>
              </Flex>
            )}

            {!previewUrl &&
              (!hasLogoFeatureAccess ? (
                <Popover
                  open={isUpgradePopoverOpen}
                  trigger="click"
                  placement="bottomLeft"
                  onOpenChange={setIsUpgradePopoverOpen}
                  title={
                    <Flex align="center" justify="space-between" style={{ width: '100%' }}>
                      <Typography.Text strong>
                        {t('customLogoUpgradePopoverTitle', {
                          defaultValue: t('customLogoUpgradePopoverTitle'),
                        })}
                      </Typography.Text>
                      <Button
                        type="text"
                        size="small"
                        aria-label={t('closePopover', { defaultValue: t('closePopover') })}
                        onClick={event => {
                          event.stopPropagation();
                          setIsUpgradePopoverOpen(false);
                        }}
                      >
                        ×
                      </Button>
                    </Flex>
                  }
                  content={changeLogoUpgradePopoverContent}
                >
                  <Button
                    size="small"
                    onClick={handleChangeLogoClick}
                    disabled={uploading}
                    type="default"
                    style={{ width: 'fit-content' }}
                  >
                    {t('changeLogo', { defaultValue: t('changeLogo') })}
                  </Button>
                </Popover>
              ) : (
                <Button
                  size="small"
                  onClick={handleChangeLogoClick}
                  disabled={uploading}
                  type="default"
                  style={{ width: 'fit-content' }}
                >
                  {t('changeLogo', { defaultValue: t('changeLogo') })}
                </Button>
              ))}

            {imageDimensions && fileSize && (
              <div
                style={{
                  padding: '8px 12px',
                  backgroundColor: token.colorFillTertiary,
                  borderRadius: token.borderRadius,
                  width: 'fit-content',
                }}
              >
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {imageDimensions.width} × {imageDimensions.height}px •{' '}
                  {(fileSize / 1024).toFixed(1)} KB
                </Typography.Text>
              </div>
            )}

            {!previewUrl && (
              <Typography.Text type="secondary" style={{ fontSize: 12, lineHeight: 1.6 }}>
                {t('logoRecommendedSize')}
              </Typography.Text>
            )}

            <Typography.Text
              type="secondary"
              style={{ fontSize: 11, lineHeight: 1.5, marginTop: 8, opacity: 0.7 }}
            >
              {t('logoUsage')}
            </Typography.Text>
          </Flex>
        </Flex>
      </Flex>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
};

// Helpers
const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/** Scales an image down on a canvas; PNG keeps the transparent background. */
const scaleImage = (img: HTMLImageElement, scale: number): string => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not supported');
  context.imageSmoothingQuality = 'high';
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
};

// Static content
const MAX_LOGO_WIDTH = 800;
const MAX_LOGO_HEIGHT = 240;
const NAVBAR_PREVIEW_THEMES = ['light', 'dark'] as const;
const NAVBAR_BG_LIGHT = '#ffffff';
const NAVBAR_BG_DARK = '#141414';

export default OrganizationLogo;
