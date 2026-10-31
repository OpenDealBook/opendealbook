import { z } from 'zod';

import {
  BrokerRefused,
  brokerJson,
  type BrokerCredentials,
  type BrokerFirm,
  type BrokerOutcome,
  type BrokerRecord,
} from './broker';

export type BaselayerCheck =
  | { step: 'search' }
  | { step: 'searching'; searchId: string }
  | { step: 'records'; lienSearchId: string; docketSearchId: string };

type BaselayerOutcome = BrokerOutcome<{ status: 'pending'; check: BaselayerCheck } | { status: 'no_match' }>;

const COMPLETED = 'COMPLETED';
const GAVE_UP = new Set(['FAILED', 'CANCELLED']);

const order = z.object({ id: z.string(), state: z.string() });

const businessSearch = order.extend({
  business: z
    .object({
      id: z.string(),
      registrations: z.array(z.object({ state: z.string(), registration_type: z.string() })),
      addresses: z.array(z.object({ state: z.string() })),
    })
    .nullish(),
});

const filing = z
  .object({
    state: z.string(),
    filing_number: z.string(),
    filing_type: z.string(),
    filing_date: z.string().nullable(),
    status: z.string(),
    parties: z.array(z.object({ role: z.string(), name: z.string() }).loose()),
  })
  .loose();

const docket = z
  .object({
    title: z.string(),
    docket_number: z.string(),
    court: z.string().nullable(),
    date_filed: z.string().nullable(),
    normalized_status: z.string().nullable(),
    is_bankruptcy: z.boolean(),
  })
  .loose();

const lienSearch = order.extend({ filings: z.array(filing) });
const docketSearch = order.extend({ dockets: z.array(docket) });

const LIEN_KIND_BY_FILING_FAMILY: Record<string, BrokerRecord['kind']> = {
  consensual: 'ucc',
  tax: 'tax_lien',
  judicial: 'judgment_lien',
};

const OPEN_BY_STATUS: Record<string, boolean> = {
  Active: true,
  Terminated: false,
  Lapsed: false,
  open: true,
  closed: false,
};

function lienRecord(hit: z.infer<typeof filing>): BrokerRecord {
  return {
    source: 'baselayer',
    kind: LIEN_KIND_BY_FILING_FAMILY[hit.filing_type.split('.')[0]!] ?? 'unknown',
    title: hit.parties
      .filter(({ role }) => role !== 'debtor')
      .map(({ name }) => name)
      .join(', '),
    reference: hit.filing_number,
    jurisdiction: hit.state,
    filedOn: hit.filing_date,
    open: OPEN_BY_STATUS[hit.status] ?? null,
    raw: hit,
  };
}

function docketRecord(hit: z.infer<typeof docket>): BrokerRecord {
  return {
    source: 'baselayer',
    kind: hit.is_bankruptcy ? 'bankruptcy' : 'litigation',
    title: hit.title,
    reference: hit.docket_number,
    jurisdiction: hit.court,
    filedOn: hit.date_filed,
    open: OPEN_BY_STATUS[hit.normalized_status ?? ''] ?? null,
    raw: hit,
  };
}

export async function checkBaselayer({
  credentials,
  firm,
  check,
  signal,
}: {
  credentials: BrokerCredentials;
  firm: BrokerFirm;
  check: BaselayerCheck;
  signal?: AbortSignal;
}): Promise<BaselayerOutcome> {
  const call = (path: string, body?: unknown) =>
    brokerJson('Baselayer', {
      url: `${credentials.baseUrl}${path}`,
      headers: { 'x-api-key': credentials.apiKey },
      body,
      signal,
    });

  async function afterSearch(raw: unknown): Promise<BaselayerOutcome> {
    const search = businessSearch.parse(raw);
    if (GAVE_UP.has(search.state)) {
      return { status: 'not_checked' };
    }
    if (search.state !== COMPLETED) {
      return { status: 'pending', check: { step: 'searching', searchId: search.id } };
    }
    if (!search.business) {
      return { status: 'no_match' };
    }
    const { id, registrations, addresses } = search.business;
    const homeStates = registrations
      .filter(({ registration_type }) => registration_type === 'domestic')
      .map(({ state }) => state);
    const searchStates = [...new Set([...homeStates, ...addresses.map(({ state }) => state)])];
    if (searchStates.length === 0) {
      return { status: 'not_checked' };
    }
    const liens = order.parse(await call('/lien_searches', { business_id: id, search_states: searchStates }));
    const dockets = order.parse(
      await call('/docket_searches', { business_id: id, options: ['Order.Litigations', 'Order.Bankruptcy'] }),
    );
    return { status: 'pending', check: { step: 'records', lienSearchId: liens.id, docketSearchId: dockets.id } };
  }

  async function records(lienSearchId: string, docketSearchId: string): Promise<BaselayerOutcome> {
    const lienBody = await call(`/lien_searches/${lienSearchId}`);
    const docketBody = await call(`/docket_searches/${docketSearchId}`);
    const liens = order.parse(lienBody);
    const dockets = order.parse(docketBody);
    if (GAVE_UP.has(liens.state) || GAVE_UP.has(dockets.state)) {
      return { status: 'not_checked' };
    }
    if (liens.state !== COMPLETED || dockets.state !== COMPLETED) {
      return { status: 'pending', check };
    }
    return {
      status: 'done',
      records: [
        ...lienSearch.parse(lienBody).filings.map(lienRecord),
        ...docketSearch.parse(docketBody).dockets.map(docketRecord),
      ],
    };
  }

  if (!firm.city || !firm.state) {
    return { status: 'not_checked' };
  }

  try {
    switch (check.step) {
      case 'search':
        return await afterSearch(await call('/searches', { name: firm.name, address: `${firm.city}, ${firm.state}` }));
      case 'searching':
        return await afterSearch(await call(`/searches/${check.searchId}`));
      case 'records':
        return await records(check.lienSearchId, check.docketSearchId);
    }
  } catch (error) {
    if (error instanceof BrokerRefused) {
      return { status: 'refused' };
    }
    throw error;
  }
}
