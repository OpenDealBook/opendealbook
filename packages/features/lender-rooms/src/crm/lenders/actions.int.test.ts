import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

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

import { unwrap } from '../../actions/test-support/unwrap';
import {
  addLender,
  addLenderContact,
  deleteLender,
  deleteLenderContact,
  editLender,
  editLenderContact,
  setPrimaryLenderContact,
} from './actions';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';

const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
};

const admin = createClient<Database>(
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  clientOptions,
);

const userIds: string[] = [];
const suffix = crypto.randomUUID().slice(0, 8);

const DEAL_TEAM_ONLY = 'Only the deal team can do that';
const READ_ONLY = 'This team is read-only until billing is updated.';

let owner: SupabaseClient<Database>;
let member: SupabaseClient<Database>;
let teamAccountId: string;
let lockedTeamAccountId: string;

async function provisionPerson(name: string) {
  const email = `${name}-${suffix}@odb.test`;
  const password = `Pw-${suffix}-Aa1!`;

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    throw error;
  }

  userIds.push(created.user.id);
  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, clientOptions);
  const signedIn = await client.auth.signInWithPassword({ email, password });

  if (signedIn.error) {
    throw signedIn.error;
  }

  return { client, userId: created.user.id };
}

async function newTeam(ownerId: string, slug: string) {
  const { data: team } = await admin
    .rpc('create_team_account', {
      account_name: slug,
      user_id: ownerId,
      account_slug: `${slug}-${suffix}`,
    })
    .throwOnError();

  return team.id;
}

beforeAll(async () => {
  const ownerPerson = await provisionPerson('crm-owner');
  const memberPerson = await provisionPerson('crm-member');
  owner = ownerPerson.client;
  member = memberPerson.client;

  teamAccountId = await newTeam(ownerPerson.userId, 'lender-crm');
  lockedTeamAccountId = await newTeam(ownerPerson.userId, 'lender-crm-locked');
  await admin
    .from('accounts_memberships')
    .insert({
      account_id: teamAccountId,
      user_id: memberPerson.userId,
      account_role: 'member',
    })
    .throwOnError();
  caller.client = owner;
});

afterAll(async () => {
  for (const userId of userIds) {
    await admin.auth.admin.deleteUser(userId);
  }
});

async function savedLender(id: string) {
  const { data } = await admin
    .from('lender')
    .select('*')
    .eq('id', id)
    .maybeSingle()
    .throwOnError();

  return data;
}

async function savedContact(id: string) {
  const { data } = await admin
    .from('lender_contact')
    .select('*')
    .eq('id', id)
    .maybeSingle()
    .throwOnError();

  return data;
}

function newLender(host: string, name = 'First Bank', accountId = teamAccountId) {
  return unwrap(
    addLender({
      accountId,
      name,
      website: `https://www.${host}/about`,
    }),
  );
}

describe('lenders', () => {
  it('saves a lender under the domain of its website', async () => {
    const id = await newLender(`save-${suffix}.com`);

    expect(await savedLender(id)).toMatchObject({
      account_id: teamAccountId,
      name: 'First Bank',
      website: `https://www.save-${suffix}.com/about`,
      domain: `save-${suffix}.com`,
    });
  });

  it('keeps the optional lending profile', async () => {
    const id = await unwrap(
      addLender({
        accountId: teamAccountId,
        name: 'Profiled',
        website: `profile-${suffix}.com`,
        rateType: 'fixed',
        typicalRate: 7.5,
        maxLoan: 5_000_000,
        sbaPreferred: true,
        industries: ['hvac'],
        states: ['TX'],
        tags: ['fast'],
        notes: 'Call Tuesdays',
      }),
    );

    expect(await savedLender(id)).toMatchObject({
      rate_type: 'fixed',
      typical_rate: 7.5,
      max_loan: 5_000_000,
      sba_preferred: true,
      industries: ['hvac'],
      states: ['TX'],
      tags: ['fast'],
      notes: 'Call Tuesdays',
    });
  });

  it('refuses a website that has no domain', async () => {
    const result = await addLender({
      accountId: teamAccountId,
      name: 'Nowhere',
      website: 'not a website',
    });

    expect(result).toEqual({
      ok: false,
      refusal: 'Enter a website like firstbank.com',
    });
  });

  it('refuses a second lender on the same domain however it is spelled', async () => {
    await newLender(`dupe-${suffix}.com`);

    const result = await addLender({
      accountId: teamAccountId,
      name: 'Twin',
      website: `DUPE-${suffix}.com`,
    });

    expect(result).toEqual({
      ok: false,
      refusal: 'This team already saved a lender with that website',
    });
  });

  it('edits a lender and follows a changed website to its new domain', async () => {
    const id = await newLender(`before-${suffix}.com`);

    await unwrap(
      editLender({
        lenderId: id,
        name: 'Renamed',
        website: `after-${suffix}.com`,
      }),
    );

    expect(await savedLender(id)).toMatchObject({
      name: 'Renamed',
      domain: `after-${suffix}.com`,
    });
  });

  it('leaves the domain alone when the website is not edited', async () => {
    const id = await newLender(`stay-${suffix}.com`);

    await unwrap(editLender({ lenderId: id, notes: 'Only a note' }));

    expect(await savedLender(id)).toMatchObject({
      domain: `stay-${suffix}.com`,
      notes: 'Only a note',
    });
  });

  it('refuses to edit a lender onto a domain the team already saved', async () => {
    await newLender(`taken-${suffix}.com`);
    const id = await newLender(`mover-${suffix}.com`);

    const result = await editLender({
      lenderId: id,
      website: `taken-${suffix}.com`,
    });

    expect(result).toEqual({
      ok: false,
      refusal: 'This team already saved a lender with that website',
    });
  });

  it('deletes a lender together with its contacts', async () => {
    const id = await newLender(`gone-${suffix}.com`);
    const contactId = await unwrap(
      addLenderContact({ lenderId: id, name: 'Dana' }),
    );

    await unwrap(deleteLender({ lenderId: id }));

    expect(await savedLender(id)).toBeNull();
    expect(await savedContact(contactId)).toBeNull();
  });
});

describe('lender contacts', () => {
  it('adds a contact to a lender, never as the primary', async () => {
    const lenderId = await newLender(`contacts-${suffix}.com`);

    const id = await unwrap(
      addLenderContact({
        lenderId,
        name: 'Dana',
        email: 'dana@example.com',
        phone: '555-0100',
      }),
    );

    expect(await savedContact(id)).toMatchObject({
      account_id: teamAccountId,
      lender_id: lenderId,
      name: 'Dana',
      email: 'dana@example.com',
      phone: '555-0100',
      is_primary: false,
    });
  });

  it('edits a contact', async () => {
    const lenderId = await newLender(`edit-contact-${suffix}.com`);
    const id = await unwrap(addLenderContact({ lenderId, name: 'Dana' }));

    await unwrap(editLenderContact({ contactId: id, email: 'd@example.com' }));

    expect(await savedContact(id)).toMatchObject({
      name: 'Dana',
      email: 'd@example.com',
    });
  });

  it('deletes a contact and keeps the lender', async () => {
    const lenderId = await newLender(`del-contact-${suffix}.com`);
    const id = await unwrap(addLenderContact({ lenderId, name: 'Dana' }));

    await unwrap(deleteLenderContact({ contactId: id }));

    expect(await savedContact(id)).toBeNull();
    expect(await savedLender(lenderId)).not.toBeNull();
  });
});

describe('clearing optional fields', () => {
  it('clears the lending profile of a lender', async () => {
    const id = await unwrap(
      addLender({
        accountId: teamAccountId,
        name: 'Full',
        website: `clear-${suffix}.com`,
        rateType: 'fixed',
        typicalRate: 7.5,
        maxLoan: 1,
        sbaPreferred: true,
        industries: ['hvac'],
        states: ['TX'],
        tags: ['fast'],
        notes: 'note',
      }),
    );

    await unwrap(
      editLender({
        lenderId: id,
        rateType: null,
        typicalRate: null,
        maxLoan: null,
        sbaPreferred: false,
        industries: [],
        states: [],
        tags: [],
        notes: null,
      }),
    );

    expect(await savedLender(id)).toMatchObject({
      rate_type: null,
      typical_rate: null,
      max_loan: null,
      sba_preferred: false,
      industries: [],
      states: [],
      tags: [],
      notes: null,
    });
  });

  it('clears the email and phone of a contact that is not primary', async () => {
    const lenderId = await newLender(`clear-contact-${suffix}.com`);
    const id = await unwrap(
      addLenderContact({
        lenderId,
        name: 'Dana',
        email: 'd@example.com',
        phone: '555',
      }),
    );

    await unwrap(editLenderContact({ contactId: id, email: null, phone: null }));

    expect(await savedContact(id)).toMatchObject({ email: null, phone: null });
  });
});

describe('the primary contact', () => {
  async function twoContacts(host: string) {
    const lenderId = await newLender(host);
    const a = await unwrap(
      addLenderContact({ lenderId, name: 'A', email: 'a@example.com' }),
    );
    const b = await unwrap(
      addLenderContact({ lenderId, name: 'B', email: 'b@example.com' }),
    );

    return { lenderId, a, b };
  }

  async function primaries(lenderId: string) {
    const { data } = await admin
      .from('lender_contact')
      .select('name')
      .eq('lender_id', lenderId)
      .eq('is_primary', true)
      .throwOnError();

    return data.map((row) => row.name);
  }

  it('moves from one contact to the next, never two at once', async () => {
    const { lenderId, a, b } = await twoContacts(`primary-${suffix}.com`);

    await unwrap(setPrimaryLenderContact({ contactId: a }));
    expect(await primaries(lenderId)).toEqual(['A']);

    await unwrap(setPrimaryLenderContact({ contactId: b }));
    expect(await primaries(lenderId)).toEqual(['B']);
  });

  it('refuses a contact with no email', async () => {
    const lenderId = await newLender(`no-email-${suffix}.com`);
    const id = await unwrap(addLenderContact({ lenderId, name: 'Dana' }));

    expect(await setPrimaryLenderContact({ contactId: id })).toEqual({
      ok: false,
      refusal: 'Add an email before making this the primary contact',
    });
    expect(await primaries(lenderId)).toEqual([]);
  });

  it('refuses to remove the email of the primary contact', async () => {
    const { lenderId, a } = await twoContacts(`keep-email-${suffix}.com`);
    await unwrap(setPrimaryLenderContact({ contactId: a }));

    expect(await editLenderContact({ contactId: a, email: null })).toEqual({
      ok: false,
      refusal: 'The primary contact needs an email',
    });
    expect(await savedContact(a)).toMatchObject({ email: 'a@example.com' });
  });
});

describe('a team member who cannot manage deals', () => {
  it('is refused every lender action and changes nothing', async () => {
    const lenderId = await newLender(`member-${suffix}.com`);
    const contactId = await unwrap(
      addLenderContact({ lenderId, name: 'Dana', email: 'd@example.com' }),
    );
    caller.client = member;

    const results = await Promise.all([
      addLender({
        accountId: teamAccountId,
        name: 'Nope',
        website: `nope-${suffix}.com`,
      }),
      editLender({ lenderId, name: 'Changed' }),
      deleteLender({ lenderId }),
      addLenderContact({ lenderId, name: 'Eve' }),
      editLenderContact({ contactId, name: 'Changed' }),
      setPrimaryLenderContact({ contactId }),
      deleteLenderContact({ contactId }),
    ]);
    caller.client = owner;

    expect(results).toEqual(
      results.map(() => ({ ok: false, refusal: DEAL_TEAM_ONLY })),
    );
    expect(await savedLender(lenderId)).toMatchObject({ name: 'First Bank' });
    expect(await savedContact(contactId)).toMatchObject({
      name: 'Dana',
      is_primary: false,
    });
  });
});

describe('a team in billing read-only lock', () => {
  it('is refused every lender action', async () => {
    const lenderId = await newLender(
      `locked-${suffix}.com`,
      'First Bank',
      lockedTeamAccountId,
    );
    const contactId = await unwrap(
      addLenderContact({ lenderId, name: 'Dana', email: 'd@example.com' }),
    );
    await admin
      .from('accounts')
      .update({ trial_ends_at: new Date(Date.now() - 86_400_000).toISOString() })
      .eq('id', lockedTeamAccountId)
      .throwOnError();

    const results = await Promise.all([
      addLender({
        accountId: lockedTeamAccountId,
        name: 'Nope',
        website: `nope-locked-${suffix}.com`,
      }),
      editLender({ lenderId, name: 'Changed' }),
      deleteLender({ lenderId }),
      addLenderContact({ lenderId, name: 'Eve' }),
      editLenderContact({ contactId, name: 'Changed' }),
      setPrimaryLenderContact({ contactId }),
      deleteLenderContact({ contactId }),
    ]);

    expect(results).toEqual(
      results.map(() => ({ ok: false, refusal: READ_ONLY })),
    );
    expect(await savedLender(lenderId)).toMatchObject({ name: 'First Bank' });
  });
});
