import type { Enums, Tables } from '@tuckin/supabase';

export type NotificationRow = Pick<
  Tables<'notifications'>,
  'id' | 'body' | 'type' | 'link' | 'created_at'
>;

export type NotificationViewModel = {
  id: number;
  body: string;
  type: Enums<'notification_type'>;
  link: string | null;
  createdAt: string;
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
  };
}
