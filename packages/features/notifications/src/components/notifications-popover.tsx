'use client';

import { useNotifications } from '../hooks/use-notifications';
import { NotificationsBell } from './notifications-bell';

export function NotificationsPopover({ accountId }: { accountId: string }) {
  const { notifications, dismiss, markAllRead } = useNotifications(accountId);

  return (
    <NotificationsBell
      notifications={notifications}
      onDismiss={(id) => void dismiss(id)}
      onMarkAllRead={() => void markAllRead()}
    />
  );
}
