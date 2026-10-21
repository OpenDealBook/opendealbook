'use client';

import { useEffect } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useSupabase, useUser } from '@odb/supabase/hooks';

import { dismissNotification } from '../server/dismiss-notification';
import { markAllNotificationsRead } from '../server/mark-all-notifications-read';
import { toNotificationViewModel } from '../types';

export function useNotifications(accountId: string) {
  const client = useSupabase();
  const queryClient = useQueryClient();
  const userId = useUser().data?.id;
  const queryKey = ['notifications', accountId, userId];

  const query = useQuery({
    queryKey,
    enabled: userId !== undefined,
    queryFn: async () => {
      const { data } = await client
        .from('notifications')
        .select(
          'id, body, type, link, created_at, deal(firm!inner(name)), notification_reads(read_at)',
        )
        .eq('account_id', accountId)
        .eq('dismissed', false)
        .or(`recipient_user_id.eq.${userId},recipient_user_id.is.null`)
        .order('created_at', { ascending: false })
        .throwOnError();

      return data.map(toNotificationViewModel);
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey });

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
        () => {
          void queryClient.invalidateQueries({
            queryKey: ['notifications', accountId, userId],
          });
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [client, queryClient, accountId, userId]);

  return {
    notifications: query.data ?? [],
    dismiss: async (id: number) => {
      await dismissNotification({ id });
      await refresh();
    },
    markAllRead: async () => {
      await markAllNotificationsRead({ accountId });
      await refresh();
    },
  };
}
