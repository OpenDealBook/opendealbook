'use client';

import { Bell, X } from 'lucide-react';

import { Badge } from '@tuckin/ui/badge';
import { Button } from '@tuckin/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@tuckin/ui/dropdown-menu';
import { cn } from '@tuckin/ui/utils';

import { useNotifications } from '../hooks/use-notifications';
import { dismissNotification } from '../server/dismiss-notification';
import type { NotificationViewModel } from '../types';

export function NotificationsPopover({ accountId }: { accountId: string }) {
  const { notifications, unreadCount } = useNotifications(accountId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-4" />

          <Badge
            className={cn(
              'absolute -top-1 -right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[0.625rem]',
              { hidden: unreadCount === 0 },
            )}
          >
            {unreadCount}
          </Badge>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        {notifications.map((notification) => (
          <NotificationItem key={notification.id} notification={notification} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationItem({
  notification,
}: {
  notification: NotificationViewModel;
}) {
  return (
    <div className="flex items-start justify-between gap-2 px-2 py-1.5 text-sm">
      {notification.link ? (
        <a href={notification.link} className="hover:underline">
          {notification.body}
        </a>
      ) : (
        <span>{notification.body}</span>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        onClick={() => {
          void dismissNotification({ id: notification.id });
        }}
      >
        <X className="size-3" />
      </Button>
    </div>
  );
}
