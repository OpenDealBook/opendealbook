import type { Enums, Tables } from '@odb/supabase';

export type NotificationRow = Pick<
  Tables<'notifications'>,
  'id' | 'body' | 'type' | 'link' | 'created_at'
> & {
  deal: { firm: { name: string } } | null;
  notification_reads: { read_at: string }[];
};

export type NotificationViewModel = {
  id: number;
  body: string;
  type: Enums<'notification_type'>;
  link: string | null;
  createdAt: string;
  read: boolean;
  dealName: string | null;
};

export function toNotificationViewModel(
  row: NotificationRow,
): NotificationViewModel {
  return {
    id: row.id,
    body: row.body,
    type: row.type,
    link: row.link,
    createdAt: row.created_at,
    read: row.notification_reads.length > 0,
    dealName: row.deal === null ? null : row.deal.firm.name,
  };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const age = new Intl.RelativeTimeFormat('en', { style: 'narrow' });

export function notificationAge(createdAt: string, now: Date): string {
  const elapsed = now.getTime() - new Date(createdAt).getTime();

  if (elapsed < MINUTE) {
    return 'just now';
  }
  if (elapsed < HOUR) {
    return age.format(-Math.floor(elapsed / MINUTE), 'minute');
  }
  if (elapsed < DAY) {
    return age.format(-Math.floor(elapsed / HOUR), 'hour');
  }
  return age.format(-Math.floor(elapsed / DAY), 'day');
}
