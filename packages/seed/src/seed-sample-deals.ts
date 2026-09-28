import { dataRoomObjectPath } from '@tuckin/data-room/storage';
import type { TablesInsert } from '@tuckin/supabase';
import { getSupabaseServerAdminClient } from '@tuckin/supabase/admin';

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

  const deals: TablesInsert<'deal'>[] = [
    {
      id: dealIds[0],
      account_id: accountId,
      firm_id: firmIds[0],
      stage: STAGE_SOURCED,
      source: 'marketplace',
      description: `${SAMPLE_TAG} Sample sourced deal for onboarding`,
      revenue_ttm: 4200000,
      ebitda_ttm: 780000,
      asking_price: 3100000,
      owner_user_id: userId,
      created_by: userId,
    },
    {
      id: dealIds[1],
      account_id: accountId,
      firm_id: firmIds[1],
      stage: STAGE_LOI,
      source: 'referral',
      description: `${SAMPLE_TAG} Sample deal under letter of intent`,
      revenue_ttm: 2600000,
      ebitda_ttm: 640000,
      asking_price: 2900000,
      owner_user_id: userId,
      created_by: userId,
    },
    {
      id: diligenceDealId,
      account_id: accountId,
      firm_id: firmIds[2],
      stage: STAGE_DILIGENCE,
      source: 'outreach',
      description: `${SAMPLE_TAG} Sample deal in diligence`,
      revenue_ttm: 9800000,
      ebitda_ttm: 1450000,
      asking_price: 7200000,
      owner_user_id: userId,
      created_by: userId,
    },
    {
      id: dealIds[3],
      account_id: accountId,
      firm_id: firmIds[3],
      stage: STAGE_CLOSED_WON,
      source: 'manual',
      description: `${SAMPLE_TAG} Sample closed-won deal`,
      revenue_ttm: 1800000,
      ebitda_ttm: 410000,
      asking_price: 1650000,
      close_date: '2026-06-30',
      owner_user_id: userId,
      created_by: userId,
    },
  ];

  const checklistItems: TablesInsert<'checklist_item'>[] = [
    {
      account_id: accountId,
      deal_id: diligenceDealId,
      title: `${SAMPLE_TAG} Trailing 12-month P&L`,
      category: 'Financials',
      priority: 1,
      deal_killer: true,
      status: 'reviewed',
      outcome: 'accepted',
    },
    {
      account_id: accountId,
      deal_id: diligenceDealId,
      title: `${SAMPLE_TAG} Federal tax returns (3 years)`,
      category: 'Financials',
      priority: 2,
      status: 'received',
    },
    {
      account_id: accountId,
      deal_id: diligenceDealId,
      title: `${SAMPLE_TAG} Corporate formation documents`,
      category: 'Legal',
      priority: 1,
      deal_killer: true,
      status: 'requested',
    },
    {
      account_id: accountId,
      deal_id: diligenceDealId,
      title: `${SAMPLE_TAG} Material customer contracts`,
      category: 'Legal',
      priority: 3,
      status: 'not_started',
    },
    {
      account_id: accountId,
      deal_id: diligenceDealId,
      title: `${SAMPLE_TAG} Customer concentration analysis`,
      category: 'Operations',
      priority: 2,
      status: 'requested',
    },
    {
      account_id: accountId,
      deal_id: diligenceDealId,
      title: `${SAMPLE_TAG} Employee roster and org chart`,
      category: 'Operations',
      priority: 3,
      status: 'not_started',
    },
    {
      account_id: accountId,
      deal_id: diligenceDealId,
      title: `${SAMPLE_TAG} Facility lease agreement`,
      category: 'Real Estate',
      priority: 3,
      status: 'not_started',
    },
  ];

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

  const documentName = `${SAMPLE_TAG} Trailing 12-month P&L.pdf`;

  await client.from('firm').insert(firms);
  await client.from('deal').insert(deals);

  await client.from('contract').insert({
    id: contractId,
    account_id: accountId,
    deal_id: dealIds[1] as string,
    type: 'loi',
    status: 'draft',
    current_version: 1,
    created_by: userId,
  } satisfies TablesInsert<'contract'>);

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

  await client.from('checklist_item').insert(checklistItems);
  await client.from('dr_folder').insert(folders);

  await client.from('dr_document').insert({
    account_id: accountId,
    deal_id: diligenceDealId,
    folder_id: financialsFolderId,
    name: documentName,
    storage_path: dataRoomObjectPath(diligenceDealId, documentName),
    uploaded_by: userId,
  } satisfies TablesInsert<'dr_document'>);

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
