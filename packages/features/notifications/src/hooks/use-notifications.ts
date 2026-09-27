'use client';

import { useEffect, useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { useSupabase } from '@tuckin/supabase/hooks';

import {
  type NotificationRow,
  type NotificationViewModel,
  toNotificationViewModel,
} from '../types';

export function useNotifications(accountId: string) {
  const client = useSupabase();
  const [streamed, setStreamed] = useState<NotificationViewModel[]>([]);

  const query = useQuery({
    queryKey: ['notifications', accountId],
    queryFn: async () => {
      const { data, error } = await client
        .from('notifications')
        .select('id, body, type, link, created_at')
        .eq('account_id', accountId)
        .eq('dismissed', false)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return data.map(toNotificationViewModel);
    },
  });

  useEffect(() => {
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
  }, [client, accountId]);

  const notifications = [...streamed, ...(query.data ?? [])];

  return { notifications, unreadCount: notifications.length };
}
