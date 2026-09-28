'use client';

import type { ReactNode } from 'react';

import { useQuery } from '@tanstack/react-query';

import { useSupabase } from '@odb/supabase/hooks';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';
import { Skeleton } from '@odb/ui/skeleton';

export function PersonalAccountBillingPanel({
  accountId,
  children,
}: {
  accountId: string;
  children?: ReactNode;
}) {
  const client = useSupabase();

  const query = useQuery({
    queryKey: ['account:subscription', accountId],
    queryFn: async () => {
      const { data, error } = await client
        .from('subscriptions')
        .select('id, status, active, currency, period_ends_at')
        .eq('account_id', accountId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data;
    },
    enabled: !!accountId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing</CardTitle>
        <CardDescription>Manage your subscription and plan.</CardDescription>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : query.data ? (
          <div className="flex flex-col space-y-1 text-sm">
            <span>Status: {query.data.status}</span>
            <span>Renews: {query.data.period_ends_at}</span>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
