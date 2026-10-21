'use client';

import { useEffect } from 'react';

import { useRouter } from 'next/navigation';

import type { Database } from '@odb/supabase';
import { useSupabase } from '@odb/supabase/hooks';

type Tables = Database['public']['Tables'];

interface Watch<Table extends keyof Tables & string> {
  table: Table;
  column: keyof Tables[Table]['Row'] & string;
  value: string;
}

export function useLiveRefresh<Table extends keyof Tables & string>(
  table: Table,
  column: Watch<Table>['column'],
  value: string,
) {
  const client = useSupabase();
  const router = useRouter();

  useEffect(() => {
    const filter = `${column}=eq.${value}`;
    const refresh = () => router.refresh();
    // A channel carries the token it joined with; joining before the session
    // is read joins as anon, and RLS then delivers nothing.
    const channel = client.realtime.setAuth().then(() =>
      client
        .channel(`${table}:${filter}:${crypto.randomUUID()}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table, filter },
          refresh,
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table, filter },
          refresh,
        )
        .subscribe(),
    );

    return () => {
      void channel.then((joined) => client.removeChannel(joined));
    };
  }, [client, router, table, column, value]);
}

export function LiveRefresh<Table extends keyof Tables & string>({
  table,
  column,
  value,
}: Watch<Table>) {
  useLiveRefresh(table, column, value);

  return null;
}
