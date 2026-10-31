import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { z } from 'zod';

import {
  BrokerRefused,
  brokerJson,
  type BrokerCredentials,
  type BrokerFirm,
  type BrokerOutcome,
  type BrokerRecord,
} from './broker';

export const MIDDESK_POLL_INTERVAL = '5 minutes';
export const MIDDESK_GIVE_UP_AFTER = '24 hours';

const VERIFY = 'business_verification_verify';
const RECORD_PRODUCTS = ['litigations', 'liens', 'bankruptcies'];

const business = z.object({ id: z.string() });

const order = z.object({ product: z.string(), status: z.string(), completed_at: z.string().nullish() });

const lien = z
  .object({
    type: z.string(),
    state: z.string().nullable(),
    status: z.string(),
    filing_date: z.string().nullable(),
    file_number: z.string(),
    secured_parties: z.array(z.object({ name: z.string() }).loose()),
  })
  .loose();

const litigation = z
  .object({
    case_name: z.string(),
    case_number: z.string(),
    case_status: z.string(),
    filing_date: z.string().nullable(),
    jurisdictions: z.string().nullable(),
  })
  .loose();

const bankruptcy = z
  .object({
    case_number: z.string(),
    chapter: z.number(),
    court: z.string().nullable(),
    filing_date: z.string().nullable(),
  })
  .loose();

const LIEN_KIND_BY_TYPE: Record<string, BrokerRecord['kind']> = { ucc: 'ucc', state: 'tax_lien', federal: 'tax_lien' };
const OPEN_BY_STATUS: Record<string, boolean> = { open: true, closed: false, Open: true, Closed: false };

function lienRecord(hit: z.infer<typeof lien>): BrokerRecord {
  return {
    source: 'middesk',
    kind: LIEN_KIND_BY_TYPE[hit.type] ?? 'unknown',
    title: hit.secured_parties.map(({ name }) => name).join(', '),
    reference: hit.file_number,
    jurisdiction: hit.state,
    filedOn: hit.filing_date,
    open: OPEN_BY_STATUS[hit.status] ?? null,
    raw: hit,
  };
}

function litigationRecord(hit: z.infer<typeof litigation>): BrokerRecord {
  return {
    source: 'middesk',
    kind: 'litigation',
    title: hit.case_name,
    reference: hit.case_number,
    jurisdiction: hit.jurisdictions,
    filedOn: hit.filing_date,
    open: OPEN_BY_STATUS[hit.case_status] ?? null,
    raw: hit,
  };
}

function bankruptcyRecord(hit: z.infer<typeof bankruptcy>): BrokerRecord {
  return {
    source: 'middesk',
    kind: 'bankruptcy',
    title: `Chapter ${hit.chapter} bankruptcy`,
    reference: hit.case_number,
    jurisdiction: hit.court,
    filedOn: hit.filing_date,
    open: null,
    raw: hit,
  };
}

export async function checkMiddesk({
  credentials,
  accountId,
  firmId,
  firm,
  signal,
}: {
  credentials: BrokerCredentials;
  accountId: string;
  firmId: string;
  firm: BrokerFirm;
  signal?: AbortSignal;
}): Promise<BrokerOutcome<{ status: 'pending' }>> {
  if (!firm.city || !firm.state) {
    return { status: 'not_checked' };
  }
  const { city, state } = firm;
  const db = getSupabaseServerAdminClient();
  const call = (path: string, body?: unknown) =>
    brokerJson('Middesk', {
      url: `${credentials.baseUrl}${path}`,
      headers: { authorization: `Basic ${Buffer.from(`${credentials.apiKey}:`).toString('base64')}` },
      body,
      signal,
    });

  async function everyPage<T>(path: string, item: z.ZodType<T>) {
    const page = z.object({ data: z.array(item), has_more: z.boolean() });
    const rows: T[] = [];
    for (let number = 1; ; number += 1) {
      const { data, has_more } = page.parse(
        await call(`${path}?page=${number}`),
      );
      rows.push(...data);
      if (!has_more) {
        return rows;
      }
    }
  }

  async function businessId() {
    const { data: claim } = await db
      .rpc('claim_middesk_business', { p_account_id: accountId, p_firm_id: firmId })
      .single()
      .throwOnError();
    if (claim.business_id || !claim.claimed) {
      return claim.business_id;
    }
    const [earlier] = z
      .object({ data: z.array(business) })
      .parse(await call(`/businesses?${new URLSearchParams({ external_id: firmId })}`)).data;
    const { id } =
      earlier ??
      business.parse(
        await call('/businesses', {
          name: firm.name,
          external_id: firmId,
          addresses: [{ city, state }],
          orders: [{ product: VERIFY }, { product: 'litigations' }, { product: 'bankruptcies' }],
        }),
      );
    await db
      .from('middesk_business')
      .update({ business_id: id })
      .eq('account_id', accountId)
      .eq('firm_id', firmId)
      .throwOnError();
    return id;
  }

  try {
    const id = await businessId();
    if (!id) {
      return { status: 'pending' };
    }
    const placed = await everyPage(`/businesses/${id}/orders`, order);
    if (placed.some((each) => RECORD_PRODUCTS.includes(each.product) && each.status === 'rejected')) {
      return { status: 'not_checked' };
    }
    const completed = (product: string) => placed.some((each) => each.product === product && each.completed_at);
    if (!completed(VERIFY)) {
      return { status: 'pending' };
    }
    const missing = RECORD_PRODUCTS.filter((product) => !placed.some((each) => each.product === product));
    for (const product of missing) {
      await call(`/businesses/${id}/orders`, { product });
    }
    if (!RECORD_PRODUCTS.every(completed)) {
      return { status: 'pending' };
    }
    const [liens, litigations, bankruptcies] = await Promise.all([
      everyPage(`/businesses/${id}/liens`, lien),
      everyPage(`/businesses/${id}/litigations`, litigation),
      everyPage(`/businesses/${id}/bankruptcies`, bankruptcy),
    ]);
    return {
      status: 'done',
      records: [
        ...liens.map(lienRecord),
        ...litigations.map(litigationRecord),
        ...bankruptcies.map(bankruptcyRecord),
      ],
    };
  } catch (error) {
    if (error instanceof BrokerRefused) {
      return { status: 'refused' };
    }
    throw error;
  }
}
