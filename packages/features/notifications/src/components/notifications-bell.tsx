'use client';

import { Bell, X } from 'lucide-react';

import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@odb/ui/dropdown-menu';
import { cn } from '@odb/ui/utils';

import { notificationAge, type NotificationViewModel } from '../types';

export function NotificationsBell({
  notifications,
  onDismiss,
  onMarkAllRead,
}: {
  notifications: NotificationViewModel[];
  onDismiss: (id: number) => void;
  onMarkAllRead: () => void;
}) {
  const unreadCount = notifications.filter(({ read }) => !read).length;
  const now = new Date();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unreadCount === 0
              ? 'Notifications'
              : `Notifications, ${unreadCount} unread`
          }
        >
          <Bell className="size-4" aria-hidden />

          {unreadCount > 0 && (
            <Badge
              aria-hidden
              className="absolute -top-1 -right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[0.625rem] tabular-nums"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between gap-2 py-1 pr-1 pl-3">
          <DropdownMenuLabel className="px-0">Notifications</DropdownMenuLabel>
          {notifications.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={unreadCount === 0}
              onClick={onMarkAllRead}
            >
              Mark all read
            </Button>
          )}
        </div>

        <DropdownMenuSeparator className="m-0" />

        {notifications.length === 0 ? (
          <p className="text-muted-foreground px-3 py-8 text-center text-sm">
            No notifications yet
          </p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {notifications.map((notification) => (
              <li
                key={notification.id}
                className="flex items-start gap-2 border-b px-3 py-2.5 text-sm last:border-b-0"
              >
                <span
                  aria-hidden
                  className={cn('bg-primary mt-1.5 size-2 shrink-0 rounded-full', {
                    invisible: notification.read,
                  })}
                />

                <div className="min-w-0 flex-1">
                  <p
                    className={cn({
                      'font-medium': !notification.read,
                      'text-muted-foreground': notification.read,
                    })}
                  >
                    {notification.link ? (
                      <a href={notification.link} className="hover:underline">
                        {notification.body}
                      </a>
                    ) : (
                      notification.body
                    )}
                  </p>

                  <p className="text-muted-foreground mt-0.5 flex gap-2 text-xs">
                    {notification.dealName && (
                      <span className="truncate">{notification.dealName}</span>
                    )}
                    <time dateTime={notification.createdAt} className="shrink-0">
                      {notificationAge(notification.createdAt, now)}
                    </time>
                  </p>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0"
                  aria-label="Dismiss"
                  onClick={() => onDismiss(notification.id)}
                >
                  <X className="size-3" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
