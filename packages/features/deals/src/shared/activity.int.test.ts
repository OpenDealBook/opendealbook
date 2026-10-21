import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { appendDealEvent, appendDealEvents } from '@odb/events';

import {
  type IntegrationAccount,
  provisionAccount,
} from '../../test-support/integration-harness';
import { fetchDealActivity } from './activity';

let account: IntegrationAccount;
let dealId: string;
let userName: string;

beforeAll(async () => {
  account = await provisionAccount();
  dealId = crypto.randomUUID();

  const { data: personal } = await account.admin
    .from('accounts')
    .select('name')
    .eq('primary_owner_user_id', account.userId)
    .eq('is_personal_account', true)
    .single()
    .throwOnError();
  userName = personal.name;

  await appendDealEvent(account.user, {
    dealId,
    aggregateType: 'deal',
    aggregateId: dealId,
    eventType: 'deal.created',
    payload: {
      account_id: account.accountId,
      owner_user_id: account.userId,
      firm_id: null,
      description: 'Activity deal',
      source: 'manual',
      stage: 'sourcing',
    },
  });
  await appendDealEvent(account.user, {
    dealId,
    aggregateType: 'checklist_item',
    aggregateId: crypto.randomUUID(),
    eventType: 'checklist_item.added',
    payload: { title: 'Tax returns' },
  });
  await appendDealEvent(account.admin, {
    dealId,
    aggregateType: 'deal_update',
    aggregateId: crypto.randomUUID(),
    eventType: 'deal_update.sent',
    payload: { subject: 'We signed the LOI' },
    actorKind: 'service',
    actorVia: 'workflow',
  });
});

afterAll(async () => {
  await account.admin.from('accounts').delete().eq('id', account.accountId);
  await account.cleanup();
});

describe('fetchDealActivity', () => {
  it('lists who did what and when, newest first, with people named', async () => {
    const { entries: activity, more } = await fetchDealActivity(
      account.user,
      dealId,
      account.accountId,
      0,
    );

    expect(more).toBe(false);
    expect(activity.map(({ who, what }) => ({ who, what }))).toEqual([
      { who: 'Open Deal Book', what: 'sent the update "We signed the LOI"' },
      { who: userName, what: 'added checklist item "Tax returns"' },
      { who: userName, what: 'created the deal in Sourcing' },
    ]);
    expect(activity.every(({ at }) => !Number.isNaN(Date.parse(at)))).toBe(
      true,
    );
  });

  it('pages the feed fifty at a time, newest first', async () => {
    const busyDeal = crypto.randomUUID();
    await appendDealEvent(account.user, {
      dealId: busyDeal,
      aggregateType: 'deal',
      aggregateId: busyDeal,
      eventType: 'deal.created',
      payload: {
        account_id: account.accountId,
        owner_user_id: account.userId,
        firm_id: null,
        description: 'Busy deal',
        source: 'manual',
        stage: 'sourcing',
      },
    });
    await appendDealEvents(
      account.user,
      busyDeal,
      Array.from({ length: 52 }, (_, index) => ({
        aggregateType: 'checklist_item' as const,
        aggregateId: crypto.randomUUID(),
        eventType: 'checklist_item.added' as const,
        payload: { title: `Item ${index + 1}` },
      })),
    );

    const first = await fetchDealActivity(
      account.user,
      busyDeal,
      account.accountId,
      0,
    );
    const second = await fetchDealActivity(
      account.user,
      busyDeal,
      account.accountId,
      1,
    );

    expect(first.entries).toHaveLength(50);
    expect(first.entries[0]!.what).toBe('added checklist item "Item 52"');
    expect(first.more).toBe(true);
    expect(second.entries.map(({ what }) => what)).toEqual([
      'added checklist item "Item 2"',
      'added checklist item "Item 1"',
      'created the deal in Sourcing',
    ]);
    expect(second.more).toBe(false);
  });

  it("never names a file in the Seller's counsel folder", async () => {
    const quietDeal = crypto.randomUUID();
    await appendDealEvent(account.user, {
      dealId: quietDeal,
      aggregateType: 'deal',
      aggregateId: quietDeal,
      eventType: 'deal.created',
      payload: {
        account_id: account.accountId,
        owner_user_id: account.userId,
        firm_id: null,
        description: 'Quiet deal',
        source: 'manual',
        stage: 'sourcing',
      },
    });
    const { data: counsel } = await account.admin.auth.admin.createUser({
      email: `int-seller-counsel-${crypto.randomUUID().slice(0, 8)}@odb.test`,
      email_confirm: true,
    });
    await account.admin
      .from('deal_counsel')
      .insert({
        account_id: account.accountId,
        deal_id: quietDeal,
        side: 'seller',
        user_id: counsel.user!.id,
        email: counsel.user!.email!,
      })
      .throwOnError();
    const { data: folder } = await account.admin
      .from('seller_counsel_folder')
      .select('folder_id')
      .eq('deal_id', quietDeal)
      .single()
      .throwOnError();
    await appendDealEvent(account.admin, {
      dealId: quietDeal,
      aggregateType: 'dr_document',
      aggregateId: crypto.randomUUID(),
      eventType: 'dr_document.added',
      payload: {
        folder_id: folder.folder_id,
        name: 'side-letter.pdf',
        storage_path: `deal/${quietDeal}/side-letter.pdf`,
        version: 1,
        uploaded_by: null,
      },
      actorKind: 'service',
    });

    const { entries } = await fetchDealActivity(
      account.user,
      quietDeal,
      account.accountId,
      0,
    );

    await account.admin.auth.admin.deleteUser(counsel.user!.id);

    expect(entries.map(({ what }) => what)).toEqual([
      'created the deal in Sourcing',
    ]);
  });
});
