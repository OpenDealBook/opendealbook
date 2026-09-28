import { dataRoomObjectPath } from '@odb/data-room/storage';
import { appendDealEvents, type DealEventInput } from '@odb/events';
import type { TablesInsert } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

export const SAMPLE_TAG = '[Example]';

const STAGE_SOURCED = 'sourced';
const STAGE_LOI = 'loi';
const STAGE_DILIGENCE = 'diligence';
const STAGE_CLOSED_WON = 'closed_won';

type SeedInput = {
  accountId: string;
  userId: string;
};

export async function hasSampleData(accountId: string): Promise<boolean> {
  const client = getSupabaseServerAdminClient();

  const { data } = await client
    .from('firm')
    .select('id')
    .eq('account_id', accountId)
    .ilike('name', `${SAMPLE_TAG}%`)
    .limit(1);

  return (data ?? []).length > 0;
}

export async function seedSampleDeals({
  accountId,
  userId,
}: SeedInput): Promise<void> {
  if (await hasSampleData(accountId)) {
    return;
  }

  const client = getSupabaseServerAdminClient();

  const firmIds = [
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
  ];
  const dealIds = [
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
    crypto.randomUUID(),
  ];
  const contractId = crypto.randomUUID();
  const diligenceDealId = dealIds[2] as string;
  const rootFolderId = crypto.randomUUID();
  const financialsFolderId = crypto.randomUUID();
  const legalFolderId = crypto.randomUUID();
  const documentId = crypto.randomUUID();

  const firms: TablesInsert<'firm'>[] = [
    {
      id: firmIds[0],
      account_id: accountId,
      name: `${SAMPLE_TAG} Coastal HVAC Services`,
      industry: 'Home Services',
      city: 'Tampa',
      state: 'FL',
      employee_band: '25-50',
      established_year: 2004,
      icp_score: 84,
      owner_name: 'Dana Ruiz',
      status: 'deal_created',
      created_by: userId,
    },
    {
      id: firmIds[1],
      account_id: accountId,
      name: `${SAMPLE_TAG} Summit Dental Group`,
      industry: 'Healthcare',
      city: 'Denver',
      state: 'CO',
      employee_band: '10-25',
      established_year: 2011,
      icp_score: 76,
      owner_name: 'Priya Nair',
      status: 'deal_created',
      created_by: userId,
    },
    {
      id: firmIds[2],
      account_id: accountId,
      name: `${SAMPLE_TAG} Riverline Logistics`,
      industry: 'Transportation',
      city: 'Columbus',
      state: 'OH',
      employee_band: '50-100',
      established_year: 1998,
      icp_score: 69,
      owner_name: 'Marcus Bell',
      status: 'deal_created',
      created_by: userId,
    },
    {
      id: firmIds[3],
      account_id: accountId,
      name: `${SAMPLE_TAG} Brightwave Marketing`,
      industry: 'Professional Services',
      city: 'Austin',
      state: 'TX',
      employee_band: '10-25',
      established_year: 2015,
      icp_score: 62,
      owner_name: 'Elena Fischer',
      status: 'deal_created',
      created_by: userId,
    },
  ];

  const dealCreated = (
    dealId: string,
    firmId: string,
    stage: string,
    source: string,
    description: string,
    financials: { revenue_ttm: number; ebitda_ttm: number; asking_price: number },
  ): DealEventInput => ({
    aggregateType: 'deal',
    aggregateId: dealId,
    eventType: 'deal.created',
    actorKind: 'service',
    payload: {
      account_id: accountId,
      firm_id: firmId,
      owner_user_id: userId,
      description,
      source,
      stage,
      revenue_ttm: financials.revenue_ttm,
      ebitda_ttm: financials.ebitda_ttm,
      asking_price: financials.asking_price,
    },
  });

  const contractCreated: DealEventInput = {
    aggregateType: 'contract',
    aggregateId: contractId,
    eventType: 'contract.created',
    actorKind: 'service',
    payload: { type: 'loi', status: 'draft', current_version: 1 },
  };

  const checklistSeeds = [
    { title: 'Trailing 12-month P&L', category: 'Financials', priority: 1, deal_killer: true, status: 'reviewed' },
    { title: 'Federal tax returns (3 years)', category: 'Financials', priority: 2, deal_killer: false, status: 'received' },
    { title: 'Corporate formation documents', category: 'Legal', priority: 1, deal_killer: true, status: 'requested' },
    { title: 'Material customer contracts', category: 'Legal', priority: 3, deal_killer: false, status: 'not_started' },
    { title: 'Customer concentration analysis', category: 'Operations', priority: 2, deal_killer: false, status: 'requested' },
    { title: 'Employee roster and org chart', category: 'Operations', priority: 3, deal_killer: false, status: 'not_started' },
    { title: 'Facility lease agreement', category: 'Real Estate', priority: 3, deal_killer: false, status: 'not_started' },
  ];

  const checklistAdded: DealEventInput[] = checklistSeeds.map((seed) => ({
    aggregateType: 'checklist_item',
    aggregateId: crypto.randomUUID(),
    eventType: 'checklist_item.added',
    actorKind: 'service',
    payload: {
      title: `${SAMPLE_TAG} ${seed.title}`,
      category: seed.category,
      priority: seed.priority,
      deal_killer: seed.deal_killer,
      status: seed.status,
    },
  }));

  const firstChecklistItemId = (checklistAdded[0] as DealEventInput).aggregateId;

  const firstChecklistReviewed: DealEventInput = {
    aggregateType: 'checklist_item',
    aggregateId: firstChecklistItemId,
    eventType: 'checklist_item.status_changed',
    actorKind: 'service',
    payload: { status: 'reviewed', outcome: 'accepted' },
  };

  const documentName = `${SAMPLE_TAG} Trailing 12-month P&L.pdf`;

  const documentAdded: DealEventInput = {
    aggregateType: 'dr_document',
    aggregateId: documentId,
    eventType: 'dr_document.added',
    actorKind: 'service',
    payload: {
      folder_id: financialsFolderId,
      name: documentName,
      storage_path: dataRoomObjectPath(diligenceDealId, documentName),
    },
  };

  const folders: TablesInsert<'dr_folder'>[] = [
    {
      id: rootFolderId,
      account_id: accountId,
      deal_id: diligenceDealId,
      name: `${SAMPLE_TAG} Diligence`,
      parent_id: null,
      sort_order: 0,
    },
    {
      id: financialsFolderId,
      account_id: accountId,
      deal_id: diligenceDealId,
      name: `${SAMPLE_TAG} Financials`,
      parent_id: rootFolderId,
      sort_order: 0,
    },
    {
      id: legalFolderId,
      account_id: accountId,
      deal_id: diligenceDealId,
      name: `${SAMPLE_TAG} Legal`,
      parent_id: rootFolderId,
      sort_order: 1,
    },
  ];

  await client.from('firm').insert(firms);

  await appendDealEvents(client, dealIds[0] as string, [
    dealCreated(
      dealIds[0] as string,
      firmIds[0] as string,
      STAGE_SOURCED,
      'marketplace',
      `${SAMPLE_TAG} Sample sourced deal for onboarding`,
      { revenue_ttm: 4200000, ebitda_ttm: 780000, asking_price: 3100000 },
    ),
  ]);

  await appendDealEvents(client, dealIds[1] as string, [
    dealCreated(
      dealIds[1] as string,
      firmIds[1] as string,
      STAGE_LOI,
      'referral',
      `${SAMPLE_TAG} Sample deal under letter of intent`,
      { revenue_ttm: 2600000, ebitda_ttm: 640000, asking_price: 2900000 },
    ),
    contractCreated,
  ]);

  await appendDealEvents(client, diligenceDealId, [
    dealCreated(
      diligenceDealId,
      firmIds[2] as string,
      STAGE_DILIGENCE,
      'outreach',
      `${SAMPLE_TAG} Sample deal in diligence`,
      { revenue_ttm: 9800000, ebitda_ttm: 1450000, asking_price: 7200000 },
    ),
    ...checklistAdded,
    firstChecklistReviewed,
  ]);

  await appendDealEvents(client, dealIds[3] as string, [
    dealCreated(
      dealIds[3] as string,
      firmIds[3] as string,
      STAGE_CLOSED_WON,
      'manual',
      `${SAMPLE_TAG} Sample closed-won deal`,
      { revenue_ttm: 1800000, ebitda_ttm: 410000, asking_price: 1650000 },
    ),
    {
      aggregateType: 'deal',
      aggregateId: dealIds[3] as string,
      eventType: 'deal.updated',
      actorKind: 'service',
      payload: { close_date: '2026-06-30' },
    },
  ]);

  await client.from('contract_version').insert({
    account_id: accountId,
    contract_id: contractId,
    version: 1,
    party: 'buyer',
    source: 'generated',
    is_signed: false,
    change_summary: `${SAMPLE_TAG} Initial letter of intent draft`,
    author_user_id: userId,
  } satisfies TablesInsert<'contract_version'>);

  await client.from('generated_document').insert({
    account_id: accountId,
    deal_id: dealIds[1] as string,
    contract_id: contractId,
    created_by: userId,
    values_json: { note: `${SAMPLE_TAG} Letter of intent` },
  } satisfies TablesInsert<'generated_document'>);

  await client.from('dr_folder').insert(folders);
  await appendDealEvents(client, diligenceDealId, [documentAdded]);

  await client.from('buyer_profile').insert({
    account_id: accountId,
    version: 1,
    display_name: `${SAMPLE_TAG} Evergreen Holdings`,
    headline: `${SAMPLE_TAG} Acquiring durable home-services businesses`,
    about: `${SAMPLE_TAG} A sample buyer profile so you can see how yours will look to sellers and brokers.`,
    target_statement: `${SAMPLE_TAG} Owner-operated firms with $1M-$3M EBITDA in the Southeast US.`,
    created_by: userId,
  } satisfies TablesInsert<'buyer_profile'>);
}
