'use server';

import { z } from 'zod';

import { appendDealEvents } from '@odb/events';
import { refusableAction } from '@odb/lender-rooms/actions/refusable-action.ts';
import { Refusal } from '@odb/lender-rooms/actions/refusal.ts';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { throwAsMilestoneRefusal } from './milestone-refusal';
import { FIXED_MILESTONES } from './schema';

type ContractKind = 'closing' | 'effective' | 'diligence_end';

type Skip = 'not stated' | 'needs an accepted offer';

export type ContractDate = { kind: ContractKind; label: string } & (
  | { from: string | null; to: string }
  | { skipped: Skip }
);

const statedTerms = z.object({ effective_date: z.iso.date().optional() });

function utcDayPlus(at: string, days: number) {
  const day = new Date(at).toISOString().slice(0, 10);

  return new Date(Date.parse(day) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

async function readContractDates(contractId: string) {
  const client = getSupabaseServerClient();
  const { data: contract } = await client
    .from('contract')
    .select('deal_id, source_offer_version_id')
    .eq('id', contractId)
    .single()
    .throwOnError();

  if (contract.source_offer_version_id === null) {
    return null;
  }

  const { data: version } = await client
    .from('offer_version')
    .select('offer_id, target_close_date, diligence_days, terms')
    .eq('id', contract.source_offer_version_id)
    .single()
    .throwOnError();
  const effectiveDate = statedTerms.parse(version.terms).effective_date;

  if (
    version.target_close_date === null &&
    effectiveDate === undefined &&
    version.diligence_days === null
  ) {
    return null;
  }

  const [{ data: accepted }, { data: rows }] = await Promise.all([
    client
      .from('deal_event')
      .select('created_at')
      .eq('aggregate_type', 'offer')
      .eq('aggregate_id', version.offer_id)
      .eq('event_type', 'offer.accepted')
      .maybeSingle()
      .throwOnError(),
    client
      .from('deal_milestone')
      .select('id, kind, target_on, actual_on, shared')
      .eq('deal_id', contract.deal_id)
      .in('kind', ['closing', 'effective', 'diligence_end'])
      .throwOnError(),
  ]);

  const diligenceEnd = (days: number | null): string | Skip => {
    if (days === null) {
      return 'not stated';
    }

    return accepted === null
      ? 'needs an accepted offer'
      : utcDayPlus(accepted.created_at, days);
  };

  const stated: Record<ContractKind, string | Skip> = {
    closing: version.target_close_date ?? 'not stated',
    effective: effectiveDate ?? 'not stated',
    diligence_end: diligenceEnd(version.diligence_days),
  };

  const dates = (Object.keys(stated) as ContractKind[]).map(
    (kind): ContractDate & { existing: (typeof rows)[number] | undefined } => {
      const label = FIXED_MILESTONES[kind].label;
      const existing = rows.find((row) => row.kind === kind);
      const value = stated[kind];

      return value === 'not stated' || value === 'needs an accepted offer'
        ? { kind, label, skipped: value, existing }
        : {
            kind,
            label,
            from: existing?.target_on ?? null,
            to: value,
            existing,
          };
    },
  );

  return { dealId: contract.deal_id, dates };
}

export async function contractDatesPreview(
  contractId: string,
): Promise<ContractDate[] | null> {
  const read = await readContractDates(contractId);

  return read && read.dates.map(({ existing: _existing, ...date }) => date);
}

export const applyContractDates = refusableAction(
  async ({ contractId, previewed }) => {
    const { dealId, dates } = (await readContractDates(contractId))!;
    const applied = dates.flatMap((date) => ('to' in date ? date : []));

    const unchanged =
      applied.length === previewed.length &&
      applied.every((date) =>
        previewed.some(
          (shown) => shown.kind === date.kind && shown.from === date.from,
        ),
      );

    if (!unchanged) {
      throw new Refusal(
        'Timeline dates changed since you opened this. Review again.',
      );
    }

    const client = getSupabaseServerClient();

    await appendDealEvents(
      client,
      dealId,
      applied.map((date) => ({
        aggregateType: 'deal_milestone',
        aggregateId: date.existing?.id ?? crypto.randomUUID(),
        eventType: 'deal_milestone.set',
        payload: {
          kind: date.kind,
          target_on: date.to,
          actual_on: date.existing?.actual_on ?? null,
          shared:
            date.existing?.shared ?? FIXED_MILESTONES[date.kind].startsShared,
        },
      })),
    ).catch(throwAsMilestoneRefusal);
    await client
      .rpc('recompute_checklist_due_dates', { p_deal_id: dealId })
      .throwOnError();
  },
  {
    schema: z.object({
      contractId: z.uuid(),
      previewed: z.array(
        z.object({
          kind: z.enum(['closing', 'effective', 'diligence_end']),
          from: z.iso.date().nullable(),
        }),
      ),
    }),
  },
);
