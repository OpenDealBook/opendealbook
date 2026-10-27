import type { SupabaseClient } from '@supabase/supabase-js';

import type { Enums } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { bestCandidate, matchBlock, matchKey, matchOutcome } from './matcher';

interface SourceShape {
  table: string;
  key: string;
  reviewColumn: string;
  name: string;
  addressLine1: string;
  postalCode: string;
  ein?: string;
}

const PPP: SourceShape = {
  table: 'ppp_loan',
  key: 'loan_number',
  reviewColumn: 'ppp_loan_number',
  name: 'borrower_name',
  addressLine1: 'address_line1',
  postalCode: 'postal_code',
};

const SBA: SourceShape = {
  table: 'sba_loan',
  key: 'id',
  reviewColumn: 'sba_loan_id',
  name: 'borrower_name',
  addressLine1: 'address_line1',
  postalCode: 'postal_code',
};

const SOURCES: Record<Enums<'lead_source'>, SourceShape> = {
  ppp: PPP,
  sba_7a: SBA,
  sba_504: SBA,
  form_5500: {
    table: 'form_5500_filing',
    key: 'ack_id',
    reviewColumn: 'form_5500_ack_id',
    name: 'sponsor_name',
    addressLine1: 'address_line1',
    postalCode: 'postal_code',
    ein: 'ein',
  },
  state_registry: {
    table: 'state_registry_entity',
    key: 'id',
    reviewColumn: 'registry_entity_id',
    name: 'name',
    addressLine1: 'mailing_address_line1',
    postalCode: 'mailing_postal_code',
  },
};

const BATCH_SIZE = 500;

interface SourceRecord {
  key: string;
  name: string;
  addressLine1: string | null;
  postalCode: string | null;
  ein?: string;
}

export async function matchImportedRecords({
  source,
  importId,
}: {
  source: Enums<'lead_source'>;
  importId: string;
}): Promise<void> {
  const db: SupabaseClient = getSupabaseServerAdminClient();
  const shape = SOURCES[source];
  const columns = [
    `key:${shape.key}`,
    `name:${shape.name}`,
    `addressLine1:${shape.addressLine1}`,
    `postalCode:${shape.postalCode}`,
    ...(shape.ein ? [`ein:${shape.ein}`] : []),
  ].join(', ');

  let after: string | null = null;
  for (;;) {
    const firstPage = db.from(shape.table).select(columns).eq('import_id', importId).order(shape.key).limit(BATCH_SIZE);
    const { data: page } = await (after === null ? firstPage : firstPage.gt(shape.key, after)).throwOnError();
    const records = page as unknown as SourceRecord[];

    for (const record of records) {
      await matchRecord(db, shape, record);
    }
    if (records.length < BATCH_SIZE) {
      return;
    }
    after = records.at(-1)!.key;
  }
}

async function matchRecord(db: SupabaseClient, shape: SourceShape, record: SourceRecord) {
  const einPatch = record.ein ? { ein: record.ein } : {};
  if (record.ein) {
    const { data: held } = await db
      .from('public_business')
      .select('id')
      .eq('ein', record.ein)
      .maybeSingle()
      .throwOnError();
    if (held) {
      await link(db, shape, record, held.id);
      return;
    }
  }

  const key = matchKey(record);
  if (!key) {
    if (record.ein) {
      await link(db, shape, record, await findOrCreateBusinessId(db, 'ein', record.ein, { name: record.name, ...einPatch }));
    }
    return;
  }

  const { data: candidates } = await db
    .from('public_business')
    .select('id, name, ein')
    .like('match_key', `${matchBlock(record)}%`)
    .throwOnError();
  const best = bestCandidate<{ id: string; name: string; ein: string | null }>(record.name, candidates);
  const outcome = best ? matchOutcome(best.score) : 'drop';

  const reason = outcome === 'review' ? 'weak_match' : outcome === 'link' && record.ein && best!.ein ? 'ein_conflict' : null;

  if (reason && (await queueReviews(db, shape, record, best!, reason)) > 0) {
    return;
  }
  if (outcome === 'link' && !reason) {
    if (record.ein) {
      await db.from('public_business').update(einPatch).eq('id', best!.id).throwOnError();
    }
    await link(db, shape, record, best!.id);
    return;
  }
  if (reason === 'ein_conflict') {
    await link(db, shape, record, await findOrCreateBusinessId(db, 'ein', record.ein!, { name: record.name, ...einPatch }));
    return;
  }
  await link(
    db,
    shape,
    record,
    await findOrCreateBusinessId(db, 'match_key', key, { name: record.name, match_key: key, ...einPatch }),
  );
}

async function findOrCreateBusinessId(
  db: SupabaseClient,
  column: 'ein' | 'match_key',
  value: string,
  newBusiness: { name: string; ein?: string; match_key?: string },
): Promise<string> {
  await db
    .from('public_business')
    .upsert(newBusiness, { onConflict: column, ignoreDuplicates: true })
    .throwOnError();
  const { data } = await db.from('public_business').select('id').eq(column, value).single().throwOnError();
  return data.id;
}

async function link(db: SupabaseClient, shape: SourceShape, record: SourceRecord, businessId: string) {
  await db.from(shape.table).update({ business_id: businessId }).eq(shape.key, record.key).throwOnError();
}

async function queueReviews(
  db: SupabaseClient,
  shape: SourceShape,
  record: SourceRecord,
  candidate: { id: string; score: number; ein: string | null },
  reason: 'weak_match' | 'ein_conflict',
): Promise<number> {
  const eins = [candidate.ein, record.ein].filter(Boolean);
  const { data: firms } = await db
    .from('firm')
    .select('account_id')
    .or([`public_business_id.eq.${candidate.id}`, ...(eins.length ? [`ein.in.(${eins.join(',')})`] : [])].join(','))
    .throwOnError();
  const teams = [...new Set(firms.map((firm: { account_id: string }) => firm.account_id))];

  await db
    .from('business_match_review')
    .upsert(
      teams.map((accountId) => ({
        account_id: accountId,
        business_id: candidate.id,
        [shape.reviewColumn]: record.key,
        score: candidate.score,
        reason,
      })),
      {
        onConflict: 'account_id,business_id,ppp_loan_number,sba_loan_id,form_5500_ack_id,registry_entity_id',
        ignoreDuplicates: true,
      },
    )
    .throwOnError();
  return teams.length;
}
