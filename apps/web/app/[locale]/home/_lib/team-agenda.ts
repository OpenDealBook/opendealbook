import { z } from 'zod';

import {
  dataRoomDocumentPath,
  itemAnchor,
  teamItemPath,
} from '@odb/notifications/relay';
import { getSupabaseServerClient } from '@odb/supabase/server';

const HOUR = 60 * 60 * 1000;

export const AGENDA_SECTIONS = [
  'overdue',
  'due_soon',
  'approval',
  'activity',
  'deadline',
  'quiet_lender',
  'signoff',
] as const;

export type AgendaSection = (typeof AGENDA_SECTIONS)[number];

const agendaRow = z.object({
  section: z.enum(AGENDA_SECTIONS),
  kind: z.enum([
    'todo',
    'checklist',
    'deal_update',
    'seller_upload',
    'seller_answer',
    'lender_ask',
    'lender_form',
    'counsel_message',
    'counsel_decision',
    'milestone',
    'must_close_by',
    'quiet_lender',
    'signoff',
  ]),
  item_id: z.string(),
  deal_id: z.string().nullable(),
  deal_name: z.string().nullable(),
  room_id: z.string().nullable(),
  title: z.string().nullable(),
  detail: z.string().nullable(),
  at: z.string(),
});

export type AgendaRow = z.infer<typeof agendaRow>;

export async function loadTeamAgenda(
  accountId: string,
  wholeTeam: boolean,
): Promise<AgendaRow[]> {
  const { data } = await getSupabaseServerClient()
    .rpc('team_agenda', {
      p_account_id: accountId,
      p_whole_team: wholeTeam,
      p_as_of: new Date(
        Date.now() + Number(process.env.E2E_CLOCK_OFFSET_HOURS ?? 0) * HOUR,
      ).toISOString(),
    })
    .throwOnError();

  return z.array(agendaRow).parse(data);
}

export async function markTeamHomeVisited(accountId: string) {
  await getSupabaseServerClient()
    .rpc('record_team_home_visit', { p_account_id: accountId })
    .throwOnError();
}

const AGENDA_ITEM: Record<
  Exclude<
    AgendaRow['kind'],
    | 'todo'
    | 'lender_ask'
    | 'lender_form'
    | 'quiet_lender'
    | 'seller_upload'
    | 'must_close_by'
  >,
  Parameters<typeof teamItemPath>[2]['kind']
> = {
  checklist: 'checklist-item',
  deal_update: 'deal-update',
  seller_answer: 'seller-question',
  counsel_message: 'counsel-message',
  counsel_decision: 'contract-review',
  signoff: 'contract-review',
  milestone: 'milestone',
};

export function agendaHref(
  account: string,
  row: AgendaRow,
  showsLenders: boolean,
): string {
  const deal = `/home/${account}/deals/${row.deal_id}`;

  switch (row.kind) {
    case 'todo':
      return row.deal_id === null
        ? `/home/${account}/todos#${itemAnchor({ kind: 'todo', id: row.item_id })}`
        : teamItemPath(account, row.deal_id, { kind: 'todo', id: row.item_id });
    case 'seller_upload':
      return dataRoomDocumentPath(account, row.deal_id!, row.item_id);
    case 'must_close_by':
      return showsLenders
        ? teamItemPath(account, row.deal_id!, {
            kind: 'must-close-by',
            id: row.item_id,
          })
        : deal;
    case 'lender_ask':
      return `${deal}/lenders/${row.room_id}/requests/asks/${row.item_id}`;
    case 'lender_form':
      return `${deal}/lenders/${row.room_id}/requests/forms/${row.item_id}`;
    case 'quiet_lender':
      return `${deal}/lenders/${row.room_id}`;
    default:
      return teamItemPath(account, row.deal_id!, {
        kind: AGENDA_ITEM[row.kind],
        id: row.item_id,
      });
  }
}
