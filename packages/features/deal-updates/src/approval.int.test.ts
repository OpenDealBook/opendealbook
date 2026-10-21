import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  admin,
  ANON_KEY,
  cleanUp,
  newDeal,
  provisionPerson,
  provisionTeam,
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
  withLockedTeam,
} from '@odb/seller-rooms/test-support/world.ts';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);
vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://app.odb.test');
vi.stubEnv('SELLER_DELIVERY_FROM_EMAIL', 'updates@odb.test');

const world = vi.hoisted(() => ({
  signedInClient: null as unknown,
  deliveries: [] as { updateId: string; origin: string }[],
}));

vi.mock('@odb/workflows/client', () => ({
  startDealUpdateDelivery: async (input: {
    updateId: string;
    origin: string;
  }) => {
    world.deliveries.push(input);
  },
}));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => world.signedInClient,
}));

const { createDealUpdate, editDealUpdate, submitDealUpdate } =
  await import('./actions');
const { approveDealUpdate, rejectDealUpdate } = await import('./approval');
const { loadDealUpdates } = await import('./queries');
const { loadDealPeople } = await import('@odb/deal-people/queries.ts');

type Person = Awaited<ReturnType<typeof provisionPerson>>;

const READ_ONLY = 'This team is read-only until billing is updated.';
const TO_TEAM = { groups: ['team' as const], people: [] };
const CHANGED_RECIPIENTS =
  'Recipients changed since you opened this. Review again.';

let author: Person;
let approver: Person;
let secondApprover: Person;
let teamId: string;
let dealId: string;
let dealLink: string;

function signIn(person: Person) {
  world.signedInClient = person.client;
}

async function pending(
  subject: string,
  picks: { groups: 'team'[]; people: string[] } = TO_TEAM,
) {
  signIn(author);
  const created = await createDealUpdate({
    dealId,
    subject,
    body: 'Closing moves to December.',
    picks,
  });

  if (!created.ok) {
    throw new Error(created.refusal);
  }

  await submitDealUpdate({ updateId: created.value });

  return created.value;
}

async function stored(updateId: string) {
  const { data } = await admin
    .from('deal_update')
    .select(
      'status, decided_by, decision_note, deal_update_recipient(email, user_id)',
    )
    .eq('id', updateId)
    .single()
    .throwOnError();

  return {
    ...data,
    recipients: data.deal_update_recipient.map((row) => row.email).sort(),
  };
}

function shown() {
  return [author.email, approver.email, secondApprover.email];
}

async function noticeLinksTo(person: Person, subject: string) {
  const { data } = await admin
    .from('notifications')
    .select('link')
    .eq('recipient_user_id', person.userId)
    .like('body', `%"${subject}"%`)
    .throwOnError();

  return data.map((row) => row.link);
}

async function noticesTo(person: Person, subject: string) {
  const { data } = await admin
    .from('notifications')
    .select('body')
    .eq('recipient_user_id', person.userId)
    .like('body', `%"${subject}"%`)
    .throwOnError();

  return data.map((row) => row.body);
}

beforeAll(async () => {
  author = await provisionPerson();
  approver = await provisionPerson();
  secondApprover = await provisionPerson();
  teamId = await provisionTeam(author, 'Approval Partners');
  dealId = await newDeal(teamId, author);
  const { data: team } = await admin
    .from('accounts')
    .select('slug')
    .eq('id', teamId)
    .single()
    .throwOnError();
  dealLink = `/home/${team.slug}/deals/${dealId}`;

  await admin
    .from('accounts_memberships')
    .insert(
      [approver, secondApprover].map((person) => ({
        account_id: teamId,
        user_id: person.userId,
        account_role: 'admin',
      })),
    )
    .throwOnError();
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('deal update approval', () => {
  it('approves a pending update to the people its picks resolve to now', async () => {
    const updateId = await pending('Appraisal in');

    signIn(approver);
    expect(
      await approveDealUpdate({ updateId, version: 1, recipients: shown() }),
    ).toEqual({
      ok: true,
      value: undefined,
    });

    expect(await stored(updateId)).toEqual(
      expect.objectContaining({
        status: 'approved',
        decided_by: approver.userId,
        decision_note: null,
        recipients: shown().sort(),
      }),
    );
    expect(await noticesTo(author, 'Appraisal in')).toEqual([
      'Your update "Appraisal in" was approved',
    ]);
    expect(await noticeLinksTo(author, 'Appraisal in')).toEqual([
      `${dealLink}#deal-update-${updateId}`,
    ]);
  });

  it('refuses approval while no sender address is set, and leaves the update pending', async () => {
    const updateId = await pending('No sender yet');
    vi.stubEnv('SELLER_DELIVERY_FROM_EMAIL', '');

    signIn(approver);
    const result = await approveDealUpdate({
      updateId,
      version: 1,
      recipients: shown(),
    });
    vi.stubEnv('SELLER_DELIVERY_FROM_EMAIL', 'updates@odb.test');

    expect(result).toEqual({
      ok: false,
      refusal:
        "Deal update email isn't set up. Ask your admin to set the sender address.",
    });
    expect((await stored(updateId)).status).toBe('pending');
    expect(world.deliveries.map((delivery) => delivery.updateId)).not.toContain(
      updateId,
    );
  });

  it('still sends a copy to an author who has left the team', async () => {
    const writer = await provisionPerson();
    await admin
      .from('accounts_memberships')
      .insert({
        account_id: teamId,
        user_id: writer.userId,
        account_role: 'admin',
      })
      .throwOnError();
    signIn(writer);
    const created = await createDealUpdate({
      dealId,
      subject: 'Parting note',
      body: 'Handing over.',
      picks: { groups: [], people: [approver.email] },
    });
    const updateId = created.ok ? created.value : '';
    await submitDealUpdate({ updateId });
    await admin
      .from('accounts_memberships')
      .delete()
      .eq('account_id', teamId)
      .eq('user_id', writer.userId)
      .throwOnError();

    signIn(approver);
    expect(
      await approveDealUpdate({
        updateId,
        version: 1,
        recipients: [approver.email],
      }),
    ).toEqual({ ok: true, value: undefined });

    expect((await stored(updateId)).recipients).toEqual(
      [approver.email, writer.email].sort(),
    );
  });

  it('sends no author copy and no author notice when the author was deleted, and reaches no unpicked contact', async () => {
    const { data: contact } = await admin
      .from('contact')
      .insert({
        account_id: teamId,
        name: 'Outside Olive',
        email: 'olive@outside.test',
      })
      .select('id')
      .single()
      .throwOnError();
    await admin
      .from('deal_contact')
      .insert({
        account_id: teamId,
        deal_id: dealId,
        contact_id: contact.id,
        side: 'seller',
        role: 'broker',
      })
      .throwOnError();
    const updateId = await pending('Author gone', {
      groups: [],
      people: [approver.email],
    });
    await admin
      .from('deal_update')
      .update({ author_id: null })
      .eq('id', updateId)
      .throwOnError();

    signIn(approver);
    expect(
      await approveDealUpdate({
        updateId,
        version: 1,
        recipients: [approver.email],
      }),
    ).toEqual({ ok: true, value: undefined });
    await admin.from('contact').delete().eq('id', contact.id).throwOnError();

    expect((await stored(updateId)).recipients).toEqual([approver.email]);
    const { data: notices } = await admin
      .from('notifications')
      .select('recipient_user_id')
      .like('body', '%"Author gone"%')
      .throwOnError();
    expect(notices).toEqual([]);
  });

  it('starts delivery of the approved update', async () => {
    const updateId = await pending('Survey done');

    signIn(approver);
    await approveDealUpdate({ updateId, version: 1, recipients: shown() });

    expect(world.deliveries).toContainEqual({
      updateId,
      origin: 'https://app.odb.test',
    });
  });

  it('always sends the author a copy, even when they did not pick themselves', async () => {
    const updateId = await pending('Lender call', {
      groups: [],
      people: [approver.email],
    });

    signIn(approver);
    expect(
      await approveDealUpdate({
        updateId,
        version: 1,
        recipients: [approver.email],
      }),
    ).toEqual({ ok: true, value: undefined });

    expect((await stored(updateId)).recipients).toEqual(
      [author.email, approver.email].sort(),
    );
  });

  it('starts no delivery for a rejected update', async () => {
    const updateId = await pending('Held back');

    signIn(approver);
    await rejectDealUpdate({ updateId, version: 1, note: 'Not yet.' });

    expect(world.deliveries.map((delivery) => delivery.updateId)).not.toContain(
      updateId,
    );
  });

  it('keeps one approval and one recipient list when approve is clicked twice', async () => {
    const updateId = await pending('Rate lock');

    signIn(approver);
    await approveDealUpdate({ updateId, version: 1, recipients: shown() });
    expect(
      await approveDealUpdate({ updateId, version: 1, recipients: shown() }),
    ).toEqual({
      ok: true,
      value: undefined,
    });

    expect((await stored(updateId)).recipients).toEqual(shown().sort());
    expect(await noticesTo(author, 'Rate lock')).toHaveLength(1);
  });

  it('refuses a second approver once the first has decided', async () => {
    const updateId = await pending('Inspection');

    signIn(approver);
    await approveDealUpdate({ updateId, version: 1, recipients: shown() });
    signIn(secondApprover);

    expect(
      await rejectDealUpdate({ updateId, version: 1, note: 'Hold it.' }),
    ).toEqual({
      ok: false,
      refusal: 'Another approver already decided this update.',
    });
    expect((await stored(updateId)).status).toBe('approved');
  });

  it('refuses approval when the recipients differ from the ones shown', async () => {
    const updateId = await pending('Loan docs');

    signIn(approver);
    expect(
      await approveDealUpdate({
        updateId,
        version: 1,
        recipients: [author.email, approver.email],
      }),
    ).toEqual({ ok: false, refusal: CHANGED_RECIPIENTS });
    expect(await stored(updateId)).toEqual(
      expect.objectContaining({ status: 'pending', recipients: [] }),
    );
  });

  it('rejects with a note and sends to no one', async () => {
    const updateId = await pending('Site visit');

    signIn(approver);
    expect(
      await rejectDealUpdate({
        updateId,
        version: 1,
        note: 'Wrong date.',
      }),
    ).toEqual({ ok: true, value: undefined });

    expect(await stored(updateId)).toEqual(
      expect.objectContaining({
        status: 'rejected',
        decision_note: 'Wrong date.',
        recipients: [],
      }),
    );
    expect(await noticesTo(author, 'Site visit')).toEqual([
      'Your update "Site visit" was rejected: Wrong date.',
    ]);

    signIn(author);
    const { updates } = await loadDealUpdates({
      dealId,
      accountId: teamId,
      roster: await loadDealPeople({ dealId, accountId: teamId }),
    });
    expect(updates.find((update) => update.id === updateId)).toEqual(
      expect.objectContaining({ decision_note: 'Wrong date.' }),
    );
  });

  it('refuses a rejection without a note', async () => {
    const updateId = await pending('Survey');

    signIn(approver);
    expect(
      await rejectDealUpdate({ updateId, version: 1, note: '  ' }),
    ).toEqual({ ok: false, refusal: 'Say why the update is rejected.' });
    expect((await stored(updateId)).status).toBe('pending');
  });

  it('refuses a decision on a version the author has since edited', async () => {
    const updateId = await pending('Title report');

    signIn(author);
    await editDealUpdate({
      updateId,
      subject: 'Title report clear',
      body: 'No exceptions.',
      picks: TO_TEAM,
    });

    signIn(approver);
    expect(
      await approveDealUpdate({ updateId, version: 1, recipients: shown() }),
    ).toEqual({
      ok: false,
      refusal: 'This update changed since you opened it. Review it again.',
    });
    expect((await stored(updateId)).status).toBe('pending');
  });

  it('refuses a decision while the team is locked', async () => {
    const updateId = await pending('Before the lock');

    signIn(approver);
    await withLockedTeam(teamId, async () => {
      expect(
        await approveDealUpdate({ updateId, version: 1, recipients: shown() }),
      ).toEqual({
        ok: false,
        refusal: READ_ONLY,
      });
      expect(
        await rejectDealUpdate({ updateId, version: 1, note: 'No.' }),
      ).toEqual({ ok: false, refusal: READ_ONLY });
    });
    expect((await stored(updateId)).status).toBe('pending');
  });
});
