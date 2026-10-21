import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { appendDealEvent } from '@odb/events';

import {
  type IntegrationAccount,
  provisionAccount,
} from '../../test-support/integration-harness';

const holder = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (fn: (data: unknown, user: { id: string }) => unknown) =>
    (data: unknown, user: { id: string }) =>
      fn(data, user),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => holder.client,
}));

import {
  applyChecklistTemplate,
  linkChecklistDocument,
  postChecklistNote,
  setChecklistItemDetails,
  setChecklistItemWaitingOn,
} from './checklist-actions';
import { applyChecklistTemplateTo } from './checklist-template';
import { createDealCore } from './deal-actions';

type Action = (
  data: Record<string, unknown>,
  user: { id: string },
) => Promise<unknown>;

type TemplateKind = 'diligence' | 'closing' | 'post_close';

let account: IntegrationAccount;
let actor: { id: string };

beforeAll(async () => {
  account = await provisionAccount();
  holder.client = account.user;
  actor = { id: account.userId };
});

afterAll(async () => {
  await account.cleanup();
});

async function newDeal() {
  return await createDealCore(
    account.user,
    {
      account_id: account.accountId,
      business_name: 'Checklist dates',
      industry: 'Accounting',
      description: 'Checklist dates',
      source: 'manual',
      stage: 'sourcing',
    },
    actor.id,
  );
}

function setMilestone(
  dealId: string,
  kind: 'loi_signed' | 'closing',
  dates: { target_on?: string; actual_on?: string },
) {
  return appendDealEvent(account.user, {
    dealId,
    aggregateType: 'deal_milestone',
    aggregateId: crypto.randomUUID(),
    eventType: 'deal_milestone.set',
    payload: {
      kind,
      target_on: null,
      actual_on: null,
      shared: false,
      ...dates,
    },
  });
}

async function template(
  kind: TemplateKind,
  items: Array<{ due_offset_days: number | null; review_offset_days: number }>,
) {
  const { data } = await account.admin
    .from('checklist_template')
    .insert({ account_id: account.accountId, name: `T ${kind}`, kind })
    .select('id')
    .single()
    .throwOnError();

  await account.admin
    .from('checklist_template_item')
    .insert(
      items.map((item, index) => ({
        ...item,
        template_id: data.id,
        title: `Item ${index}`,
        sort_order: index,
      })),
    )
    .throwOnError();

  return data.id;
}

async function appliedDates(dealId: string, templateId: string) {
  await (applyChecklistTemplate as unknown as Action)(
    { deal_id: dealId, template_id: templateId },
    actor,
  );

  const { data } = await account.admin
    .from('checklist_item')
    .select('title, due_at, review_due_at')
    .eq('deal_id', dealId)
    .order('title')
    .throwOnError();

  return data.map(({ due_at, review_due_at }) => ({ due_at, review_due_at }));
}

const at = (day: string) => `${day}T00:00:00+00:00`;

describe('applyChecklistTemplate anchored dates', () => {
  it('counts diligence items from the LOI signed actual, review days on top', async () => {
    const dealId = await newDeal();
    await setMilestone(dealId, 'loi_signed', { actual_on: '2026-03-01' });
    const id = await template('diligence', [
      { due_offset_days: 10, review_offset_days: 3 },
      { due_offset_days: null, review_offset_days: 3 },
    ]);

    expect(await appliedDates(dealId, id)).toEqual([
      { due_at: at('2026-03-11'), review_due_at: at('2026-03-14') },
      { due_at: null, review_due_at: null },
    ]);
  });

  it('counts closing items back from the closing target', async () => {
    const dealId = await newDeal();
    await setMilestone(dealId, 'closing', { target_on: '2026-06-30' });
    const id = await template('closing', [
      { due_offset_days: -5, review_offset_days: 3 },
    ]);

    expect(await appliedDates(dealId, id)).toEqual([
      { due_at: at('2026-06-25'), review_due_at: at('2026-06-28') },
    ]);
  });

  it('counts post-close items from the closing actual only, never the target', async () => {
    const dealId = await newDeal();
    await setMilestone(dealId, 'closing', { target_on: '2026-06-30' });
    const id = await template('post_close', [
      { due_offset_days: 7, review_offset_days: 3 },
    ]);

    expect(await appliedDates(dealId, id)).toEqual([
      { due_at: null, review_due_at: null },
    ]);
  });

  it('dates post-close items from the closing actual once it exists', async () => {
    const dealId = await newDeal();
    await setMilestone(dealId, 'closing', {
      target_on: '2026-06-30',
      actual_on: '2026-07-01',
    });
    const id = await template('post_close', [
      { due_offset_days: 7, review_offset_days: 3 },
    ]);

    expect(await appliedDates(dealId, id)).toEqual([
      { due_at: at('2026-07-08'), review_due_at: at('2026-07-11') },
    ]);
  });
});

describe('applying a template twice', () => {
  it('adds the items once and reports nothing added the second time', async () => {
    const dealId = await newDeal();
    const id = await template('diligence', [
      { due_offset_days: 1, review_offset_days: 3 },
    ]);
    const apply = () =>
      (applyChecklistTemplate as unknown as Action)(
        { deal_id: dealId, template_id: id },
        actor,
      );

    expect(await apply()).toEqual({ ok: true, value: { count: 1 } });
    expect(await apply()).toEqual({ ok: true, value: { count: 0 } });

    const { data } = await account.admin
      .from('checklist_item')
      .select('id')
      .eq('deal_id', dealId)
      .throwOnError();

    expect(data).toHaveLength(1);
  });
});

describe('applyChecklistTemplateTo actor', () => {
  it('records the given actor on every appended event', async () => {
    const dealId = await newDeal();
    const id = await template('diligence', [
      { due_offset_days: 1, review_offset_days: 3 },
      { due_offset_days: 2, review_offset_days: 3 },
    ]);

    await applyChecklistTemplateTo(
      account.admin,
      { dealId, templateId: id },
      { actorKind: 'service', actorVia: 'documenso' },
    );

    const { data } = await account.admin
      .from('deal_event')
      .select('actor_kind, actor_via')
      .eq('deal_id', dealId)
      .eq('event_type', 'checklist_item.added')
      .throwOnError();

    expect(data).toEqual([
      { actor_kind: 'service', actor_via: 'documenso' },
      { actor_kind: 'service', actor_via: 'documenso' },
    ]);
  });
});

describe('the template claim', () => {
  async function applicationRows(dealId: string) {
    const { data } = await account.admin
      .from('deal_checklist_application')
      .select('template_id')
      .eq('deal_id', dealId)
      .throwOnError();

    return data;
  }

  it('stamps each item with the template it came from', async () => {
    const dealId = await newDeal();
    const id = await template('diligence', [
      { due_offset_days: 1, review_offset_days: 3 },
    ]);

    await applyChecklistTemplateTo(account.user, { dealId, templateId: id });

    const { data } = await account.admin
      .from('checklist_item')
      .select('source_template_id')
      .eq('deal_id', dealId)
      .throwOnError();

    expect(data).toEqual([{ source_template_id: id }]);
  });

  it('releases the claim when appending fails, so the template can be applied again', async () => {
    const dealId = await newDeal();
    const id = await template('diligence', [
      { due_offset_days: 1, review_offset_days: 3 },
    ]);
    const failing = new Proxy(account.user, {
      get: (target, property, receiver) =>
        property === 'rpc'
          ? (name: string, args: never) =>
              name === 'append_deal_events'
                ? Promise.resolve({
                    data: null,
                    error: new Error('append failed'),
                  })
                : target.rpc(name as never, args)
          : Reflect.get(target, property, receiver),
    });

    await expect(
      applyChecklistTemplateTo(failing, { dealId, templateId: id }),
    ).rejects.toThrow('append failed');
    expect(await applicationRows(dealId)).toEqual([]);

    expect(
      await applyChecklistTemplateTo(account.user, { dealId, templateId: id }),
    ).toEqual({ count: 1 });
  });

  it('applies again once every item from the template has been removed', async () => {
    const dealId = await newDeal();
    const id = await template('diligence', [
      { due_offset_days: 1, review_offset_days: 3 },
    ]);
    await applyChecklistTemplateTo(account.user, { dealId, templateId: id });

    const { data: items } = await account.admin
      .from('checklist_item')
      .select('id')
      .eq('deal_id', dealId)
      .throwOnError();

    for (const item of items) {
      await appendDealEvent(account.user, {
        dealId,
        aggregateType: 'checklist_item',
        aggregateId: item.id,
        eventType: 'checklist_item.removed',
        payload: {},
      });
    }

    expect(
      await applyChecklistTemplateTo(account.user, { dealId, templateId: id }),
    ).toEqual({ count: 1 });
  });
});

describe('setChecklistItemDetails', () => {
  async function itemOnUnanchoredDeal() {
    const dealId = await newDeal();
    const id = await template('diligence', [
      { due_offset_days: 7, review_offset_days: 3 },
    ]);
    await applyChecklistTemplateTo(account.user, { dealId, templateId: id });

    const { data } = await account.admin
      .from('checklist_item')
      .select('id')
      .eq('deal_id', dealId)
      .single()
      .throwOnError();

    return { dealId, itemId: data.id };
  }

  async function details(itemId: string) {
    const { data } = await account.admin
      .from('checklist_item')
      .select('owner_user_id, importance, due_at, review_due_at')
      .eq('id', itemId)
      .single()
      .throwOnError();

    return data;
  }

  const set = (input: Record<string, unknown>) =>
    (setChecklistItemDetails as unknown as Action)(input, actor);

  it('sets the owner, importance and a due date with review days on top', async () => {
    const { dealId, itemId } = await itemOnUnanchoredDeal();

    expect(
      await set({
        deal_id: dealId,
        id: itemId,
        owner_user_id: actor.id,
        importance: 'required',
        due_on: '2026-12-01',
      }),
    ).toMatchObject({ ok: true });

    expect(await details(itemId)).toEqual({
      owner_user_id: actor.id,
      importance: 'required',
      due_at: at('2026-12-01'),
      review_due_at: at('2026-12-04'),
    });
  });

  it('keeps a hand-set due date when the LOI signed date is set later', async () => {
    const { dealId, itemId } = await itemOnUnanchoredDeal();
    await set({ deal_id: dealId, id: itemId, due_on: '2026-12-01' });

    await setMilestone(dealId, 'loi_signed', { actual_on: '2026-03-01' });
    await account.user
      .rpc('recompute_checklist_due_dates', { p_deal_id: dealId })
      .throwOnError();

    expect(await details(itemId)).toMatchObject({
      due_at: at('2026-12-01'),
      review_due_at: at('2026-12-04'),
    });
  });

  it('refuses an owner from outside the team with a message', async () => {
    const outsider = await provisionAccount();
    const { dealId, itemId } = await itemOnUnanchoredDeal();

    expect(
      await set({
        deal_id: dealId,
        id: itemId,
        owner_user_id: outsider.userId,
      }),
    ).toEqual({
      ok: false,
      refusal: 'Only members of this team can own checklist items.',
    });
    expect(await details(itemId)).toMatchObject({ owner_user_id: null });

    await outsider.cleanup();
  });

  it('returns a hand-dated item to its scheduled date', async () => {
    const { dealId, itemId } = await itemOnUnanchoredDeal();
    await setMilestone(dealId, 'loi_signed', { actual_on: '2026-03-01' });
    await set({ deal_id: dealId, id: itemId, due_on: '2026-12-01' });

    expect(
      await set({ deal_id: dealId, id: itemId, use_scheduled_date: true }),
    ).toMatchObject({ ok: true });

    expect(await details(itemId)).toMatchObject({
      due_at: at('2026-03-08'),
      review_due_at: at('2026-03-11'),
    });
  });

  it('clears the owner, importance and due date back to not set', async () => {
    const { dealId, itemId } = await itemOnUnanchoredDeal();
    await set({
      deal_id: dealId,
      id: itemId,
      owner_user_id: actor.id,
      importance: 'required',
      due_on: '2026-12-01',
    });

    await set({
      deal_id: dealId,
      id: itemId,
      owner_user_id: null,
      importance: null,
      due_on: null,
    });

    expect(await details(itemId)).toEqual({
      owner_user_id: null,
      importance: null,
      due_at: null,
      review_due_at: null,
    });
  });

  it('changes only the details it is given', async () => {
    const { dealId, itemId } = await itemOnUnanchoredDeal();
    await set({
      deal_id: dealId,
      id: itemId,
      owner_user_id: actor.id,
      due_on: '2026-12-01',
    });

    await set({ deal_id: dealId, id: itemId, importance: 'nice_to_have' });

    expect(await details(itemId)).toEqual({
      owner_user_id: actor.id,
      importance: 'nice_to_have',
      due_at: at('2026-12-01'),
      review_due_at: at('2026-12-04'),
    });
  });
});

describe('waiting on, notes and a linked document', () => {
  async function itemOnDeal() {
    const dealId = await newDeal();
    const itemId = crypto.randomUUID();
    await appendDealEvent(account.user, {
      dealId,
      aggregateType: 'checklist_item',
      aggregateId: itemId,
      eventType: 'checklist_item.added',
      payload: { title: 'Tax returns', status: 'requested' },
    });

    return { dealId, itemId };
  }

  const run = (action: unknown, input: Record<string, unknown>) =>
    (action as Action)(input, actor);

  it('marks an item waiting on the seller without changing its status', async () => {
    const { dealId, itemId } = await itemOnDeal();

    expect(
      await run(setChecklistItemWaitingOn, {
        deal_id: dealId,
        id: itemId,
        waiting_on: 'seller',
      }),
    ).toMatchObject({ ok: true });

    const { data } = await account.admin
      .from('checklist_item')
      .select('waiting_on, status')
      .eq('id', itemId)
      .single()
      .throwOnError();

    expect(data).toEqual({ waiting_on: 'seller', status: 'requested' });
  });

  it('adds a note to the thread under its author', async () => {
    const { dealId, itemId } = await itemOnDeal();

    await run(postChecklistNote, {
      deal_id: dealId,
      id: itemId,
      body: 'Seller says Friday',
    });

    const { data } = await account.user
      .from('checklist_item_note')
      .select('body, author_user_id')
      .eq('checklist_item_id', itemId)
      .throwOnError();

    expect(data).toEqual([
      { body: 'Seller says Friday', author_user_id: actor.id },
    ]);
  });

  it('links a document from the deal data room and unlinks it', async () => {
    const { dealId, itemId } = await itemOnDeal();
    const { data: folder } = await account.admin
      .from('dr_folder')
      .insert({ account_id: account.accountId, deal_id: dealId, name: 'Tax' })
      .select('id')
      .single()
      .throwOnError();
    const documentId = crypto.randomUUID();
    await appendDealEvent(account.user, {
      dealId,
      aggregateType: 'dr_document',
      aggregateId: documentId,
      eventType: 'dr_document.added',
      payload: {
        folder_id: folder.id,
        name: 'returns-2025.pdf',
        storage_path: `deal/${dealId}/returns-2025.pdf`,
      },
    });

    await run(linkChecklistDocument, {
      deal_id: dealId,
      id: itemId,
      document_id: documentId,
    });

    const { data } = await account.admin
      .from('checklist_item')
      .select('linked_document_id')
      .eq('id', itemId)
      .single()
      .throwOnError();

    expect(data.linked_document_id).toBe(documentId);

    await run(linkChecklistDocument, {
      deal_id: dealId,
      id: itemId,
      document_id: null,
    });

    const { data: unlinked } = await account.admin
      .from('checklist_item')
      .select('linked_document_id')
      .eq('id', itemId)
      .single()
      .throwOnError();

    expect(unlinked.linked_document_id).toBeNull();
  });
});
