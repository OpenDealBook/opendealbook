import type { SupabaseClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { turnTeamBillingOn } from '@odb/supabase/test-support/team-billing';

import type { Database } from '@odb/supabase';

const caller = vi.hoisted(() => ({ client: null as unknown }));

vi.mock('@odb/next/actions', () => ({
  enhanceAction:
    (
      fn: (input: unknown, user: unknown) => unknown,
      config: { schema: { parse: (input: unknown) => unknown } },
    ) =>
    async (input: unknown) =>
      fn(
        config.schema.parse(input),
        (await (caller.client as SupabaseClient<Database>).auth.getUser()).data
          .user,
      ),
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => caller.client,
}));

import { unwrap } from '@odb/lender-rooms/actions/test-support/unwrap.ts';

import { DEFAULT_TEMPLATE } from './default-template';
import {
  addMember,
  admin,
  deleteProvisionedPeople,
  lockTeam,
  newTeam,
  provisionPerson,
} from './test-support';
import { loadOutreachTemplate } from './template';
import { resetOutreachTemplate, saveOutreachTemplate } from './template-actions';

const DEAL_TEAM_ONLY = 'Only the deal team can do that';
const READ_ONLY = 'This team is read-only until billing is updated.';

let owner: SupabaseClient<Database>;
let member: SupabaseClient<Database>;
let teamId: string;
let lockedTeamId: string;

beforeAll(async () => {
  const ownerPerson = await provisionPerson('tpl-owner');
  const memberPerson = await provisionPerson('tpl-member');
  owner = ownerPerson.client;
  member = memberPerson.client;
  teamId = await newTeam(ownerPerson.userId, 'tpl-team');
  lockedTeamId = await newTeam(ownerPerson.userId, 'tpl-locked');
  await addMember(teamId, memberPerson.userId);
  caller.client = owner;
});

afterAll(deleteProvisionedPeople);

describe('the team outreach template', () => {
  it('is the built-in default until the team saves one', async () => {
    expect(await loadOutreachTemplate(owner, teamId)).toEqual(DEFAULT_TEMPLATE);
  });

  it('is what the team saved, replaced by saving again', async () => {
    await unwrap(
      saveOutreachTemplate({ accountId: teamId, subject: 'S1', body: 'B1' }),
    );
    await unwrap(
      saveOutreachTemplate({ accountId: teamId, subject: 'S2', body: 'B2' }),
    );

    expect(await loadOutreachTemplate(owner, teamId)).toEqual({
      subject: 'S2',
      body: 'B2',
    });
  });

  it('returns to the built-in default when reset, however often it is reset', async () => {
    await unwrap(resetOutreachTemplate({ accountId: teamId }));
    await unwrap(resetOutreachTemplate({ accountId: teamId }));

    expect(await loadOutreachTemplate(owner, teamId)).toEqual(DEFAULT_TEMPLATE);
  });

  it('refuses a template with an empty subject or body', async () => {
    expect(
      await saveOutreachTemplate({ accountId: teamId, subject: '  ', body: 'B' }),
    ).toEqual({ ok: false, refusal: 'Add a subject' });
    expect(
      await saveOutreachTemplate({ accountId: teamId, subject: 'S', body: '' }),
    ).toEqual({ ok: false, refusal: 'Add a body' });
    expect(await loadOutreachTemplate(owner, teamId)).toEqual(DEFAULT_TEMPLATE);
  });

  it('refuses a template with an unknown field, in the subject or the body', async () => {
    expect(
      await saveOutreachTemplate({
        accountId: teamId,
        subject: 'Hi {{contactName}}',
        body: 'About {{dealNam}}',
      }),
    ).toEqual({ ok: false, refusal: 'Unknown field {{dealNam}}' });
    expect(
      await saveOutreachTemplate({
        accountId: teamId,
        subject: '{{bogus}}',
        body: 'B',
      }),
    ).toEqual({ ok: false, refusal: 'Unknown field {{bogus}}' });
    expect(
      await saveOutreachTemplate({
        accountId: teamId,
        subject: 'S',
        body: 'About {{ dealName }}',
      }),
    ).toEqual({ ok: false, refusal: 'Unknown field {{ dealName }}' });
    expect(await loadOutreachTemplate(owner, teamId)).toEqual(DEFAULT_TEMPLATE);
  });

  it('accepts every field the draft fills', async () => {
    await unwrap(
      saveOutreachTemplate({
        accountId: teamId,
        subject: '{{dealName}} {{teamName}}',
        body: '{{contactName}} {{lenderName}} {{termsBlock}} {{timelineBlock}} {{roomLink}} {{ourName}}',
      }),
    );
    await unwrap(resetOutreachTemplate({ accountId: teamId }));
  });

  it('is changed only by the deal team', async () => {
    caller.client = member;

    expect(
      await saveOutreachTemplate({ accountId: teamId, subject: 'S', body: 'B' }),
    ).toEqual({ ok: false, refusal: DEAL_TEAM_ONLY });
    expect(await resetOutreachTemplate({ accountId: teamId })).toEqual({
      ok: false,
      refusal: DEAL_TEAM_ONLY,
    });

    caller.client = owner;
    expect(await loadOutreachTemplate(owner, teamId)).toEqual(DEFAULT_TEMPLATE);
  });

  it('is read-only while the team is in billing lock', async () => {
    await turnTeamBillingOn(admin);
    await lockTeam(lockedTeamId);

    expect(
      await saveOutreachTemplate({
        accountId: lockedTeamId,
        subject: 'S',
        body: 'B',
      }),
    ).toEqual({ ok: false, refusal: READ_ONLY });
    expect(await resetOutreachTemplate({ accountId: lockedTeamId })).toEqual({
      ok: false,
      refusal: READ_ONLY,
    });

    const { data } = await admin
      .from('lender_outreach_template')
      .select('account_id')
      .eq('account_id', lockedTeamId)
      .throwOnError();
    expect(data).toEqual([]);
  });
});
