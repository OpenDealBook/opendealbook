import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  appendDealEvent,
  provisionAccount,
  seedDeal,
  type IntegrationAccount,
} from '../../test-support/integration-harness';

const novu = vi.hoisted(() => ({
  trigger: vi.fn(
    async (_workflowId: string, _data: { to: { subscriberId: string } }) =>
      undefined,
  ),
  subscribers: { identify: vi.fn() },
}));

vi.mock('@odb/notifications/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odb/notifications/server')>()),
  createNovuClient: () => novu,
}));

import { planDealEventNotifications } from '@odb/notifications/relay';

import { fetchDealNotificationEvents, notifyDealEvent } from './relay';

let owner: IntegrationAccount;
let teamId: string;
let teamSlug: string;

async function createTeam(account: IntegrationAccount, slug: string) {
  const { data: team } = await account.admin
    .rpc('create_team_account', {
      account_name: 'Acme Capital',
      user_id: account.userId,
      account_slug: slug,
    })
    .throwOnError();
  return team.id as string;
}

async function firmIn(account: IntegrationAccount, accountId: string) {
  const { data: firm } = await account.admin
    .from('firm')
    .insert({ account_id: accountId, name: 'Brennan Tooling' })
    .select('id')
    .single()
    .throwOnError();
  return firm.id as string;
}

beforeAll(async () => {
  owner = await provisionAccount();
  teamSlug = `relay-${crypto.randomUUID().slice(0, 8)}`;
  teamId = await createTeam(owner, teamSlug);
  process.env.NOVU_API_KEY = 'secret';
  process.env.NOVU_API_URL = 'https://novu.test';
});

afterAll(async () => {
  delete process.env.NOVU_API_KEY;
  delete process.env.NOVU_API_URL;
  await owner.admin
    .from('notifications')
    .delete()
    .eq('account_id', teamId)
    .throwOnError();
  await owner.admin.from('accounts').delete().eq('id', teamId).throwOnError();
  await owner.cleanup();
});

describe('notifyDealEvent for a team deal (integration)', () => {
  it('tells the team owner in the app and by email, linking to the offer on the deal', async () => {
    const dealId = await seedDeal(owner.admin, teamId, owner.userId, {
      description: 'Team acquisition',
      firm_id: await firmIn(owner, teamId),
    });
    const offerId = crypto.randomUUID();
    await appendDealEvent(owner.admin, {
      dealId,
      aggregateType: 'offer',
      aggregateId: offerId,
      eventType: 'offer.drafted',
    });
    await appendDealEvent(owner.admin, {
      dealId,
      aggregateType: 'offer',
      aggregateId: offerId,
      eventType: 'offer.submitted',
    });
    const { data: submitted } = await owner.admin
      .from('deal_event')
      .select('global_seq')
      .eq('deal_id', dealId)
      .eq('event_type', 'offer.submitted')
      .single()
      .throwOnError();

    await notifyDealEvent({
      globalSeq: submitted.global_seq,
      workflowId: 'deal.offer_submitted',
      dealId,
      accountId: teamId,
      actorRef: owner.userId,
      eventType: 'offer.submitted',
    });

    const { data: notices } = await owner.admin
      .from('notifications')
      .select('recipient_user_id, body, link')
      .eq('deal_id', dealId)
      .throwOnError();
    expect(notices).toEqual([
      {
        recipient_user_id: owner.userId,
        body: 'Offer submitted on Brennan Tooling',
        link: `/home/${teamSlug}/deals/${dealId}/financials#offer-${offerId}`,
      },
    ]);
    expect(
      novu.trigger.mock.calls.map(([workflowId, data]) => [
        workflowId,
        data.to.subscriberId,
        (data as { payload?: { path?: string } }).payload?.path,
      ]),
    ).toEqual([
      [
        'deal.offer_submitted',
        owner.userId,
        `/home/${teamSlug}/deals/${dealId}/financials#offer-${offerId}`,
      ],
    ]);
  });

  it('leaves one notice in the app when the same deal event is relayed twice', async () => {
    const dealId = await seedDeal(owner.admin, teamId, owner.userId, {
      description: 'Retried acquisition',
      firm_id: await firmIn(owner, teamId),
    });
    const offerId = crypto.randomUUID();
    for (const eventType of ['offer.drafted', 'offer.accepted']) {
      await appendDealEvent(owner.admin, {
        dealId,
        aggregateType: 'offer',
        aggregateId: offerId,
        eventType,
      });
    }
    const { data: accepted } = await owner.admin
      .from('deal_event')
      .select('global_seq')
      .eq('deal_id', dealId)
      .eq('event_type', 'offer.accepted')
      .single()
      .throwOnError();
    const event = {
      globalSeq: accepted.global_seq,
      workflowId: 'deal.offer_accepted',
      dealId,
      accountId: teamId,
      actorRef: owner.userId,
      eventType: 'offer.accepted',
    };

    await notifyDealEvent(event);
    await notifyDealEvent(event);

    const { data: notices } = await owner.admin
      .from('notifications')
      .select('body')
      .eq('deal_id', dealId)
      .throwOnError();
    expect(notices).toEqual([{ body: 'Offer accepted on Brennan Tooling' }]);
  });

  it('completes without notifying anyone when the deal was deleted with its team after its event was read', async () => {
    const departed = await provisionAccount();
    const departedTeamId = await createTeam(
      departed,
      `departed-${crypto.randomUUID().slice(0, 8)}`,
    );
    const dealId = await seedDeal(
      departed.admin,
      departedTeamId,
      departed.userId,
      {
        description: 'Deleted acquisition',
        firm_id: await firmIn(departed, departedTeamId),
      },
    );
    await appendDealEvent(departed.admin, {
      dealId,
      aggregateType: 'deal',
      aggregateId: dealId,
      eventType: 'deal.resolved',
      payload: { resolution: 'lost' },
    });
    const { data: resolved } = await departed.admin
      .from('deal_event')
      .select('global_seq')
      .eq('deal_id', dealId)
      .eq('event_type', 'deal.resolved')
      .single()
      .throwOnError();
    await departed.admin
      .from('accounts')
      .delete()
      .eq('id', departedTeamId)
      .throwOnError();
    await departed.cleanup();

    await notifyDealEvent({
      globalSeq: resolved.global_seq,
      workflowId: 'deal.resolved',
      dealId,
      accountId: departedTeamId,
      actorRef: null,
      eventType: 'deal.resolved',
    });

    const { data: notices } = await owner.admin
      .from('notifications')
      .select('body')
      .eq('account_id', departedTeamId)
      .throwOnError();
    expect(notices).toEqual([]);
  });

  it('tells the team in the app, and not by email, when an LOI extension is noted and when it is signed', async () => {
    const dealId = await seedDeal(owner.admin, teamId, owner.userId, {
      description: 'Extended acquisition',
      firm_id: await firmIn(owner, teamId),
    });
    const loiId = crypto.randomUUID();
    await appendDealEvent(owner.admin, {
      dealId,
      aggregateType: 'contract',
      aggregateId: loiId,
      eventType: 'contract.created',
      payload: { type: 'loi', status: 'signed', current_version: 1 },
    });
    await owner.admin
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
    const { data: before } = await owner.admin
      .from('deal_event')
      .select('global_seq')
      .eq('deal_id', dealId)
      .order('global_seq', { ascending: false })
      .limit(1)
      .single()
      .throwOnError();
    const extensionId = crypto.randomUUID();
    await appendDealEvent(owner.admin, {
      dealId,
      aggregateType: 'contract',
      aggregateId: extensionId,
      eventType: 'contract.created',
      payload: {
        type: 'loi_extension',
        parent_contract_id: loiId,
        extends_to: '2026-12-15',
        current_version: 1,
      },
    });
    await appendDealEvent(owner.admin, {
      dealId,
      aggregateType: 'contract',
      aggregateId: extensionId,
      eventType: 'contract.extension_noted',
      payload: { note: 'Seller agreed by email', noted_on: '2026-10-28' },
    });
    const { data: version } = await owner.admin
      .from('contract_version')
      .insert({
        contract_id: extensionId,
        account_id: teamId,
        version: 1,
        source: 'upload',
        party: 'buyer',
      })
      .select('id')
      .single()
      .throwOnError();
    for (const status of ['sent', 'completed']) {
      await appendDealEvent(owner.admin, {
        dealId,
        aggregateType: 'contract',
        aggregateId: extensionId,
        eventType: 'contract.signature_status_changed',
        payload: { version_id: version.id, status },
      });
    }
    novu.trigger.mockClear();

    const events = (
      await fetchDealNotificationEvents({
        afterGlobalSeq: before.global_seq,
        limit: 1000,
      })
    ).filter((event) => event.dealId === dealId);
    for (const { event, workflowId } of planDealEventNotifications(
      events,
      before.global_seq,
    ).steps) {
      await notifyDealEvent({ ...event, workflowId });
    }

    const { data: notices } = await owner.admin
      .from('notifications')
      .select('recipient_user_id, body, link')
      .eq('deal_id', dealId)
      .order('body')
      .throwOnError();
    expect(notices).toEqual(
      ['noted', 'signed'].map((how) => ({
        recipient_user_id: owner.userId,
        body: `LOI extension to Dec 15, 2026 ${how} on Brennan Tooling`,
        link: `/home/${teamSlug}/deals/${dealId}/documents`,
      })),
    );
    expect(novu.trigger).not.toHaveBeenCalled();
  });

  it('completes without notifying anyone when the resolved event is gone after the deal was read', async () => {
    const dealId = await seedDeal(owner.admin, teamId, owner.userId, {
      description: 'Vanishing acquisition',
      firm_id: await firmIn(owner, teamId),
    });

    await expect(
      notifyDealEvent({
        globalSeq: -1,
        workflowId: 'deal.resolved',
        dealId,
        accountId: teamId,
        actorRef: null,
        eventType: 'deal.resolved',
      }),
    ).resolves.toBeUndefined();

    const { data: notices } = await owner.admin
      .from('notifications')
      .select('body')
      .eq('deal_id', dealId)
      .throwOnError();
    expect(notices).toEqual([]);
  });
});
