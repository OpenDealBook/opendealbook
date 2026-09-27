'use client';

import { useEffect, useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { useSupabase, useUser } from '@tuckin/supabase/hooks';

import {
  type NotificationRow,
  type NotificationViewModel,
  toNotificationViewModel,
} from '../types';

export function useNotifications(accountId: string) {
  const client = useSupabase();
  const userId = useUser().data?.id;
  const [streamed, setStreamed] = useState<NotificationViewModel[]>([]);

  const query = useQuery({
    queryKey: ['notifications', accountId, userId],
    enabled: userId !== undefined,
    queryFn: async () => {
      const { data, error } = await client
        .from('notifications')
        .select('id, body, type, link, created_at')
        .eq('account_id', accountId)
        .eq('dismissed', false)
        .or(`recipient_user_id.eq.${userId},recipient_user_id.is.null`)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return data.map(toNotificationViewModel);
    },
  });

  useEffect(() => {
    if (userId === undefined) {
      return;
    }

    const channel = client
      .channel(`notifications:${accountId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `account_id=eq.${accountId}`,
        },
        (payload) => {
          const recipientUserId = payload.new.recipient_user_id;

          if (recipientUserId !== null && recipientUserId !== userId) {
            return;
          }

          setStreamed((existing) => [
            toNotificationViewModel(payload.new as NotificationRow),
            ...existing,
          ]);
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [client, accountId, userId]);

  const notifications = [...streamed, ...(query.data ?? [])];

  return { notifications, unreadCount: notifications.length };
}
