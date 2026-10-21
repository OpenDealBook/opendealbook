import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { turnTeamBillingOn } from '@odb/supabase/test-support/team-billing';

import {
  provisionAccount,
  type IntegrationAccount,
} from '../../test-support/integration-harness';

const caller = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (
      fn: (input: unknown, user: unknown) => unknown,
      config: { schema: { parse: (input: unknown) => unknown } },
    ) =>
    async (input: unknown) =>
      fn(config.schema.parse(input), {
        id: (caller as unknown as { userId: string }).userId,
      }),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => caller.client,
}));

import {
  addTemplateItem,
  createChecklistTemplate,
  removeTemplateItem,
  renameChecklistTemplate,
  reorderTemplateItems,
  setDefaultChecklistTemplate,
  updateTemplateItem,
} from './actions';

type Outcome<Value> =
  | { ok: true; value: Value }
  | { ok: false; refusal: string };

const run = <Input, Value>(action: unknown, input: Input) =>
  (action as (input: Input) => Promise<Outcome<Value>>)(input);

const DEAL_TEAM_ONLY = 'Only the deal team can do that';
const READ_ONLY = 'This team is read-only until billing is updated.';

let owner: IntegrationAccount;
let member: IntegrationAccount;
let teamId: string;
let lockedTeamId: string;

async function newTeam(slug: string): Promise<string> {
  const { data } = await owner.admin
    .rpc('create_team_account', {
      account_name: slug,
      user_id: owner.userId,
      account_slug: slug,
    })
    .throwOnError();

  return (data as { id: string }).id;
}

function actAs(person: IntegrationAccount) {
  caller.client = person.user;
  (caller as unknown as { userId: string }).userId = person.userId;
}

async function savedTemplate(id: string) {
  const { data } = await owner.admin
    .from('checklist_template')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  return data;
}

async function savedItems(templateId: string) {
  const { data } = await owner.admin
    .from('checklist_template_item')
    .select('*')
    .eq('template_id', templateId)
    .order('sort_order');

  return data ?? [];
}

async function newTemplate(): Promise<string> {
  actAs(owner);
  const created = await run<unknown, { id: string }>(createChecklistTemplate, {
    accountId: teamId,
    name: 'Seed',
    kind: 'diligence',
  });

  if (!created.ok) {
    throw new Error(created.refusal);
  }

  return created.value.id;
}

beforeAll(async () => {
  owner = await provisionAccount();
  member = await provisionAccount();
  const slug = `cl-${crypto.randomUUID().slice(0, 8)}`;
  teamId = await newTeam(slug);
  lockedTeamId = await newTeam(`${slug}-locked`);
  await owner.admin
    .from('accounts_memberships')
    .insert({
      account_id: teamId,
      user_id: member.userId,
      account_role: 'member',
    })
    .throwOnError();
  await owner.admin
    .from('accounts')
    .update({ trial_ends_at: new Date(Date.now() - 86_400_000).toISOString() })
    .eq('id', lockedTeamId)
    .throwOnError();
});

afterAll(async () => {
  await owner.cleanup();
  await member.cleanup();
});

describe('checklist template editing', () => {
  it('lets a team manager create a template of a kind and rename it', async () => {
    actAs(owner);
    const created = await run<unknown, { id: string }>(
      createChecklistTemplate,
      { accountId: teamId, name: 'Closing plan', kind: 'closing' },
    );

    expect(created.ok).toBe(true);
    const id = (created as { value: { id: string } }).value.id;
    expect(await savedTemplate(id)).toMatchObject({
      account_id: teamId,
      name: 'Closing plan',
      kind: 'closing',
      is_default: false,
    });

    await run(renameChecklistTemplate, { templateId: id, name: 'Closing v2' });

    expect(await savedTemplate(id)).toMatchObject({ name: 'Closing v2' });
  });

  it('adds an item with every editable field, then edits it, then removes it', async () => {
    const templateId = await newTemplate();

    const added = await run<unknown, { id: string }>(addTemplateItem, {
      templateId,
      title: 'Payoff letters',
      category: 'Lien',
      dueOffsetDays: -5,
      reviewOffsetDays: 2,
      ownerRole: 'attorney',
      importance: 'required',
      sortOrder: 0,
    });
    const itemId = (added as { value: { id: string } }).value.id;

    expect(await savedItems(templateId)).toMatchObject([
      {
        title: 'Payoff letters',
        category: 'Lien',
        due_offset_days: -5,
        review_offset_days: 2,
        owner_role: 'attorney',
        importance: 'required',
      },
    ]);

    await run(updateTemplateItem, {
      itemId,
      title: 'Payoff letters signed',
      category: null,
      dueOffsetDays: null,
      reviewOffsetDays: 4,
      ownerRole: null,
      importance: 'nice_to_have',
    });

    expect(await savedItems(templateId)).toMatchObject([
      {
        title: 'Payoff letters signed',
        category: null,
        due_offset_days: null,
        review_offset_days: 4,
        owner_role: null,
        importance: 'nice_to_have',
      },
    ]);

    await run(removeTemplateItem, { itemId });

    expect(await savedItems(templateId)).toEqual([]);
  });

  it('reorders items to the order given', async () => {
    const templateId = await newTemplate();
    const ids: string[] = [];

    for (const [index, title] of ['A', 'B', 'C'].entries()) {
      const added = await run<unknown, { id: string }>(addTemplateItem, {
        templateId,
        title,
        sortOrder: index,
      });
      ids.push((added as { value: { id: string } }).value.id);
    }

    await run(reorderTemplateItems, {
      templateId,
      itemIds: [ids[2]!, ids[0]!, ids[1]!],
    });

    expect((await savedItems(templateId)).map((item) => item.title)).toEqual([
      'C',
      'A',
      'B',
    ]);
  });

  it('leaves the order untouched when a reorder names an item outside the template', async () => {
    const templateId = await newTemplate();
    const ids: string[] = [];

    for (const [index, title] of ['A', 'B'].entries()) {
      const added = await run<unknown, { id: string }>(addTemplateItem, {
        templateId,
        title,
        sortOrder: index,
      });
      ids.push((added as { value: { id: string } }).value.id);
    }

    await expect(
      run(reorderTemplateItems, {
        templateId,
        itemIds: [ids[1]!, ids[0]!, crypto.randomUUID()],
      }),
    ).rejects.toThrow();

    expect((await savedItems(templateId)).map((item) => item.title)).toEqual([
      'A',
      'B',
    ]);
  });

  it('makes one template the default of its kind and unsets the previous default', async () => {
    const first = await newTemplate();
    const second = await newTemplate();
    const otherKind = await run<unknown, { id: string }>(
      createChecklistTemplate,
      { accountId: teamId, name: 'Closing', kind: 'closing' },
    );
    const otherKindId = (otherKind as { value: { id: string } }).value.id;

    await run(setDefaultChecklistTemplate, { templateId: otherKindId });
    await run(setDefaultChecklistTemplate, { templateId: first });
    await run(setDefaultChecklistTemplate, { templateId: second });

    expect((await savedTemplate(first))?.is_default).toBe(false);
    expect((await savedTemplate(second))?.is_default).toBe(true);
    expect((await savedTemplate(otherKindId))?.is_default).toBe(true);
  });

  it('refuses a team member who cannot manage checklists, and changes nothing', async () => {
    const templateId = await newTemplate();
    actAs(member);

    const refusals = await Promise.all([
      run(createChecklistTemplate, {
        accountId: teamId,
        name: 'Nope',
        kind: 'offer',
      }),
      run(renameChecklistTemplate, { templateId, name: 'Nope' }),
      run(addTemplateItem, { templateId, title: 'Nope' }),
      run(setDefaultChecklistTemplate, { templateId }),
    ]);

    expect(refusals).toEqual(
      refusals.map(() => ({ ok: false, refusal: DEAL_TEAM_ONLY })),
    );
    expect(await savedTemplate(templateId)).toMatchObject({ name: 'Seed' });
    expect(await savedItems(templateId)).toEqual([]);
    expect((await savedTemplate(templateId))?.is_default).toBe(false);
  });

  it('refuses a team in billing lock', async () => {
    await turnTeamBillingOn(owner.admin);
    actAs(owner);

    expect(
      await run(createChecklistTemplate, {
        accountId: lockedTeamId,
        name: 'Nope',
        kind: 'offer',
      }),
    ).toEqual({ ok: false, refusal: READ_ONLY });
  });
});
