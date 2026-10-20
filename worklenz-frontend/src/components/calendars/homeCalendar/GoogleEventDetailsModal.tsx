import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { Button, Flex, Modal, Typography } from '@/shared/antd-imports';
import { IGoogleCalendarEvent } from '@/types/google-calendar.types';
import { formatEventTimeRange } from './useGoogleCalendarEvents';

/** Read-only details of a synced Google Calendar event. */
export const GoogleEventDetailsModal = ({ event, onClose }: GoogleEventDetailsModalProps) => {
  const { t } = useTranslation('home');
  if (!event) return null;

  const when = event.is_all_day
    ? event.start_date === event.end_date
      ? `${dayjs(event.start_date).format('dddd, MMMM D, YYYY')} · ${t('homeCalendar.google.allDay', { defaultValue: 'All day' })}`
      : `${dayjs(event.start_date).format('MMM D')} – ${dayjs(event.end_date).format('MMM D, YYYY')}`
    : `${dayjs(event.start_at).format('dddd, MMMM D, YYYY')} · ${formatEventTimeRange(event)}`;

  return (
    <Modal
      open={!!event}
      onCancel={onClose}
      title={event.title || t('homeCalendar.google.untitled', { defaultValue: '(No title)' })}
      footer={
        <Flex justify="flex-end" gap={8}>
          {event.html_link && (
            <Button href={event.html_link} target="_blank" rel="noopener noreferrer">
              {t('homeCalendar.google.openInGoogle', { defaultValue: 'Open in Google Calendar' })}
            </Button>
          )}
          <Button type="primary" onClick={onClose}>
            {t('homeCalendar.google.close', { defaultValue: 'Close' })}
          </Button>
        </Flex>
      }
    >
      <Flex vertical gap={12}>
        <Typography.Text>{when}</Typography.Text>
        {event.calendar_name && (
          <Detail
            label={t('homeCalendar.google.calendar', { defaultValue: 'Calendar' })}
            value={event.calendar_name}
          />
        )}
        {event.location && (
          <Detail
            label={t('homeCalendar.google.location', { defaultValue: 'Location' })}
            value={event.location}
          />
        )}
        {event.hangout_link && (
          <Detail
            label={t('homeCalendar.google.meeting', { defaultValue: 'Video call' })}
            value={
              <Typography.Link href={event.hangout_link} target="_blank" rel="noopener noreferrer">
                {event.hangout_link}
              </Typography.Link>
            }
          />
        )}
        {event.organizer_email && (
          <Detail
            label={t('homeCalendar.google.organizer', { defaultValue: 'Organizer' })}
            value={event.organizer_email}
          />
        )}
        {event.attendees.length > 0 && (
          <Detail
            label={t('homeCalendar.google.attendees', {
              defaultValue: 'Guests ({{count}})',
              count: event.attendees.length,
            })}
            value={event.attendees
              .map(a => a.name || a.email)
              .filter(Boolean)
              .join(', ')}
          />
        )}
        {event.description && (
          <Detail
            label={t('homeCalendar.google.description', { defaultValue: 'Description' })}
            value={
              // Plain text only: Google descriptions may contain HTML, which is never rendered.
              <Typography.Paragraph
                style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}
                ellipsis={{ rows: 8, expandable: true }}
              >
                {event.description.replace(/<[^>]+>/g, ' ')}
              </Typography.Paragraph>
            }
          />
        )}
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('homeCalendar.google.readOnlyHint', {
            defaultValue: 'Synced from Google Calendar. Edit it in Google Calendar.',
          })}
        </Typography.Text>
      </Flex>
    </Modal>
  );
};

const Detail = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <Flex vertical gap={2}>
    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
      {label}
    </Typography.Text>
    {typeof value === 'string' ? <Typography.Text>{value}</Typography.Text> : value}
  </Flex>
);

interface GoogleEventDetailsModalProps {
  event: IGoogleCalendarEvent | null;
  onClose: () => void;
}
