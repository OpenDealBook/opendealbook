import type { SupabaseClient } from '@supabase/supabase-js';

import type { NovuClient } from '@odb/notifications/server';
import type { Database } from '@odb/supabase';

import {
  appendDealEvent,
  provisionAccount,
  seedDeal,
} from '../../test-support/integration-harness';

export const REQUESTED_AT = '2026-10-18T03:00:00Z';

const seeded: {
  admin?: SupabaseClient<Database>;
  teamIds: string[];
  userIds: string[];
} = {
  teamIds: [],
  userIds: [],
};

export function recordingNovu() {
  const sent: { workflowId: string; data: Parameters<NovuClient['trigger']>[1] }[] =
    [];
  const novu: NovuClient = {
    trigger: async (workflowId, data) => {
      sent.push({ workflowId, data });
    },
    subscribers: { identify: async () => undefined },
  };

  return { novu, sent };
}

export async function seedReview(options: {
  buyerCounsel?: boolean;
  sellerCounsel?: boolean;
  shared?: boolean;
  loiExtension?: boolean;
}) {
  const owner = await provisionAccount();
  const admin = owner.admin as unknown as SupabaseClient<Database>;
  seeded.admin = admin;
  seeded.userIds.push(owner.userId);

  async function createUser(label: string) {
    const email = `int-review-${label}-${crypto.randomUUID().slice(0, 8)}@odb.test`;
    const { data } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    seeded.userIds.push(data.user!.id);
    return { userId: data.user!.id, email };
  }

  const slug = `review-${crypto.randomUUID().slice(0, 8)}`;
  const { data: team } = await admin
    .rpc('create_team_account', {
      account_name: 'Acme Capital',
      user_id: owner.userId,
      account_slug: slug,
    })
    .throwOnError();
  const teamId = (team as { id: string }).id;
  seeded.teamIds.push(teamId);

  const { data: firm } = await admin
    .from('firm')
    .insert({ account_id: teamId, name: 'Acme Tooling' })
    .select('id')
    .single()
    .throwOnError();
  const dealId = await seedDeal(owner.admin, teamId, owner.userId, {
    firm_id: firm.id,
    description: 'Private team description',
  });
  const codeName = `Project ${dealId.slice(0, 8)}`;
  await appendDealEvent(owner.admin, {
    dealId,
    aggregateType: 'deal',
    aggregateId: dealId,
    eventType: 'deal.updated',
    payload: { code_name: codeName },
  });

  const buyerCounsel = await createUser('buyer-counsel');
  const sellerCounsel = await createUser('seller-counsel');
  const seller = await createUser('seller');
  await admin
    .from('deal_counsel')
    .insert([
      ...(options.buyerCounsel === false
        ? []
        : [{ ...buyerCounsel, side: 'buyer' as const }]),
      ...(options.sellerCounsel === false
        ? []
        : [{ ...sellerCounsel, side: 'seller' as const }]),
    ].map((counsel) => ({
      account_id: teamId,
      deal_id: dealId,
      side: counsel.side,
      user_id: counsel.userId,
      email: counsel.email,
    })))
    .throwOnError();

  const { data: folder } = await admin
    .from('dr_folder')
    .insert({ account_id: teamId, deal_id: dealId, name: 'Seller uploads' })
    .select('id')
    .single()
    .throwOnError();
  const { data: room } = await admin
    .from('seller_room')
    .insert({ account_id: teamId, deal_id: dealId, uploads_folder_id: folder.id })
    .select('id')
    .single()
    .throwOnError();
  await admin
    .from('seller_room_member')
    .insert({ room_id: room.id, user_id: seller.userId, email: seller.email, name: 'Sam Vendor' })
    .throwOnError();

  const contractId = crypto.randomUUID();
  await appendDealEvent(owner.admin, {
    dealId,
    aggregateType: 'contract',
    aggregateId: contractId,
    eventType: 'contract.created',
    payload: {
      status: 'draft',
      current_version: 2,
      ...(options.loiExtension
        ? {
            type: 'loi_extension',
            parent_contract_id: await signedLoiNeedingSignOff(),
            extends_to: '2026-12-01',
          }
        : { type: 'apa' }),
    },
  });

  async function signedLoiNeedingSignOff() {
    await admin
      .from('deal_contract_review_gate_change')
      .insert({
        account_id: teamId,
        deal_id: dealId,
        contract_type: 'loi',
        required: true,
        changed_by: owner.userId,
      })
      .throwOnError();
    const loiId = crypto.randomUUID();
    await appendDealEvent(owner.admin, {
      dealId,
      aggregateType: 'contract',
      aggregateId: loiId,
      eventType: 'contract.created',
      payload: { type: 'loi', status: 'signed', current_version: 1 },
    });
    await admin
      .from('contract_version')
      .insert({
        contract_id: loiId,
        account_id: teamId,
        version: 1,
        source: 'upload',
        party: 'buyer',
        is_signed: true,
      })
      .throwOnError();
    return loiId;
  }

  async function addVersion(version: number, shared: boolean) {
    const { data } = await admin
      .from('contract_version')
      .insert({
        contract_id: contractId,
        account_id: teamId,
        version,
        source: 'upload',
        party: 'buyer',
        shared_at: shared ? REQUESTED_AT : null,
      })
      .select('id')
      .single()
      .throwOnError();
    return data.id;
  }

  await addVersion(1, false);
  const versionId = await addVersion(2, options.shared ?? true);

  async function request(requestedAt: string) {
    const { data } = await admin
      .from('contract_review_request')
      .insert({
        account_id: teamId,
        contract_version_id: versionId,
        requested_by: owner.userId,
        requested_at: requestedAt,
      })
      .select('id')
      .single()
      .throwOnError();
    return data.id;
  }

  const requestId = await request(REQUESTED_AT);

  return {
    admin,
    requestId,
    owner,
    teamId,
    slug,
    dealId,
    codeName,
    roomId: room.id,
    versionId,
    buyerCounsel,
    sellerCounsel,
    seller,
    request,
    decide: async (side: 'buyer' | 'seller', decidedAt: string) => {
      await admin
        .from('contract_review_decision')
        .insert({
          account_id: teamId,
          contract_version_id: versionId,
          side,
          decision: 'approved',
          decided_by: side === 'buyer' ? buyerCounsel.userId : sellerCounsel.userId,
          without_counsel: false,
          decided_at: decidedAt,
        })
        .throwOnError();
    },
    supersede: async () => {
      await addVersion(3, true);
      await appendDealEvent(owner.admin, {
        dealId,
        aggregateType: 'contract',
        aggregateId: contractId,
        eventType: 'contract.version_set',
        payload: { current_version: 3 },
      });
    },
    archive: async () => {
      await appendDealEvent(owner.admin, {
        dealId,
        aggregateType: 'deal',
        aggregateId: dealId,
        eventType: 'deal.archived',
        payload: {},
      });
    },
    share: async () => {
      await admin
        .from('contract_version')
        .update({ shared_at: new Date().toISOString() })
        .eq('id', versionId)
        .throwOnError();
    },
    setTimezone: async (userId: string, timezone: string) => {
      await admin
        .from('accounts')
        .update({ timezone })
        .eq('id', userId)
        .throwOnError();
    },
  };
}

export async function removeEverythingSeeded() {
  const admin = seeded.admin!;
  for (const teamId of seeded.teamIds) {
    await admin.from('accounts').delete().eq('id', teamId);
  }
  for (const userId of seeded.userIds) {
    await admin.auth.admin.deleteUser(userId);
  }
}
