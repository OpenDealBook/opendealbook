import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

const DEFAULT_QUIET_DAYS = 5;
const HOUR = 3_600_000;

type DueRow = Omit<
  Database['public']['Functions']['lender_rooms_due_nudge']['Returns'][number],
  'lender_id'
> & {
  lender_id: string | null;
};

export interface LenderToNudge {
  lenderId: string | null;
  lenderName: string;
  primaryContact: { name: string; email: string | null } | null;
  deals: {
    roomId: string;
    dealId: string;
    dealName: string;
    daysSilent: number;
    dueSince: string;
  }[];
}

export async function fetchQuietDays(
  client: SupabaseClient<Database>,
  accountId: string,
): Promise<number> {
  const { data } = await client
    .from('lender_nudge_setting')
    .select('quiet_days')
    .eq('account_id', accountId)
    .maybeSingle()
    .throwOnError();

  return data?.quiet_days ?? DEFAULT_QUIET_DAYS;
}

export async function listLendersToNudge(
  client: SupabaseClient<Database>,
  accountId: string,
): Promise<LenderToNudge[]> {
  const { data } = await client
    .rpc('lender_rooms_due_nudge', {
      p_account_id: accountId,
      p_as_of: new Date(
        Date.now() + Number(process.env.E2E_CLOCK_OFFSET_HOURS ?? 0) * HOUR,
      ).toISOString(),
    })
    .throwOnError();
  const { data: sent } = await client
    .from('lender_room_outreach')
    .select('room_id')
    .in(
      'room_id',
      data.map((row) => row.room_id),
    )
    .eq('kind', 'outreach')
    .eq('status', 'sent')
    .throwOnError();
  const sentRoomIds = new Set(sent.map((row) => row.room_id));
  const rows = (data as DueRow[]).filter((row) => sentRoomIds.has(row.room_id));

  const savedIds = [...new Set(rows.flatMap((row) => row.lender_id ?? []))];
  const { data: saved } = await client
    .from('lender')
    .select('id, name, lender_contact(name, email, is_primary)')
    .in('id', savedIds)
    .throwOnError();
  const savedById = new Map(saved.map((lender) => [lender.id, lender]));

  const brandNameByRoom = new Map(
    await Promise.all(
      rows
        .filter((row) => row.lender_id === null)
        .map(async (row) => {
          const { data: views } = await client
            .rpc('lender_room_view', { room_id: row.room_id })
            .throwOnError();
          const view = views[0]!;

          return [row.room_id, view.brand_name ?? view.name] as const;
        }),
    ),
  );

  const groups = new Map<string, LenderToNudge>();

  for (const row of rows) {
    const lender =
      row.lender_id === null ? null : savedById.get(row.lender_id)!;
    const lenderName = lender?.name ?? brandNameByRoom.get(row.room_id)!;
    const key = row.lender_id ?? `unsaved:${lenderName}`;

    const primary = lender?.lender_contact.find(
      (contact) => contact.is_primary,
    );
    const group = groups.get(key) ?? {
      lenderId: row.lender_id,
      lenderName,
      primaryContact: primary
        ? { name: primary.name, email: primary.email }
        : null,
      deals: [],
    };

    group.deals.push({
      roomId: row.room_id,
      dealId: row.deal_id,
      dealName: row.deal_name,
      daysSilent: row.days_silent,
      dueSince: row.due_since,
    });
    groups.set(key, group);
  }

  return [...groups.values()];
}
