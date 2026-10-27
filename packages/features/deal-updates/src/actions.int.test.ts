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

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', ANON_KEY);
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

const world = vi.hoisted(() => ({ signedInClient: null as unknown }));

vi.mock('@odb/supabase/server', () => ({
  getSupabaseServerClient: () => world.signedInClient,
}));

const {
  createDealUpdate,
  draftTimelineUpdate,
  editDealUpdate,
  submitDealUpdate,
} = await import('./actions');
const { loadDealUpdates } = await import('./queries');
const { loadDealPeople } = await import('@odb/deal-people/queries.ts');
const { addDealContact } = await import('@odb/deal-people/actions.ts');

type Person = Awaited<ReturnType<typeof provisionPerson>>;

const READ_ONLY = 'This team is read-only until billing is updated.';
const TO_LENDERS = { groups: ['lenders' as const], people: [] };

let owner: Person;
let member: Person;
let teamId: string;
let dealId: string;

function signIn(person: Person) {
  world.signedInClient = person.client;
}

async function board(person: Person) {
  signIn(person);

  return loadDealUpdates({
    dealId,
    accountId: teamId,
    roster: await loadDealPeople({ dealId, accountId: teamId }),
  });
}

async function draft(subject: string, onDeal = dealId) {
  signIn(owner);
  const created = await createDealUpdate({
    dealId: onDeal,
    subject,
    body: 'Closing moves to December.',
    picks: TO_LENDERS,
  });

  if (!created.ok) {
    throw new Error(created.refusal);
  }

  return created.value;
}

async function updateIn(person: Person, updateId: string) {
  const { updates } = await board(person);

  return updates.find((update) => update.id === updateId);
}

beforeAll(async () => {
  owner = await provisionPerson();
  member = await provisionPerson();
  teamId = await provisionTeam(owner, 'Update Partners');
  dealId = await newDeal(teamId, owner);

  await admin
    .from('accounts_memberships')
    .insert({
      account_id: teamId,
      user_id: member.userId,
      account_role: 'member',
    })
    .throwOnError();
});

afterAll(async () => {
  await cleanUp([teamId]);
});

describe('deal updates', () => {
  it('saves a draft only its author can see', async () => {
    const updateId = await draft('Closing date');

    expect(await updateIn(owner, updateId)).toEqual(
      expect.objectContaining({
        subject: 'Closing date',
        body: 'Closing moves to December.',
        picks: TO_LENDERS,
        status: 'draft',
        mine: true,
      }),
    );
    expect(await updateIn(member, updateId)).toBeUndefined();
  });

  it('keeps an edited draft a draft with the new content', async () => {
    const updateId = await draft('Rate lock');
    const picks = { groups: ['team' as const], people: ['x@deal.test'] };

    signIn(owner);
    expect(
      await editDealUpdate({
        updateId,
        subject: 'Rate lock extended',
        body: 'Through Friday.',
        picks,
      }),
    ).toEqual({ ok: true, value: undefined });

    expect(await updateIn(owner, updateId)).toEqual(
      expect.objectContaining({
        subject: 'Rate lock extended',
        body: 'Through Friday.',
        picks,
        status: 'draft',
      }),
    );
  });

  it('submits a draft for approval, which the whole team then sees', async () => {
    const updateId = await draft('Appraisal in');

    signIn(owner);
    expect(await submitDealUpdate({ updateId })).toEqual({
      ok: true,
      value: undefined,
    });

    expect(await updateIn(member, updateId)).toEqual(
      expect.objectContaining({
        subject: 'Appraisal in',
        status: 'pending',
        mine: false,
      }),
    );
  });

  it('keeps an edited pending update pending under a new version', async () => {
    const updateId = await draft('Site visit');

    signIn(owner);
    await submitDealUpdate({ updateId });
    const before = (await updateIn(owner, updateId))!.version;
    await editDealUpdate({
      updateId,
      subject: 'Site visit moved',
      body: 'Now Tuesday.',
      picks: TO_LENDERS,
    });

    expect(await updateIn(owner, updateId)).toEqual(
      expect.objectContaining({
        subject: 'Site visit moved',
        status: 'pending',
        version: before + 1,
      }),
    );
  });

  it('refuses an update without a subject or body', async () => {
    signIn(owner);

    expect(
      await createDealUpdate({
        dealId,
        subject: '  ',
        body: 'Text',
        picks: TO_LENDERS,
      }),
    ).toEqual({ ok: false, refusal: 'Give the update a subject.' });
    expect(
      await createDealUpdate({
        dealId,
        subject: 'Subject',
        body: ' ',
        picks: TO_LENDERS,
      }),
    ).toEqual({ ok: false, refusal: 'Write the update.' });
  });

  it('refuses writing while the team is locked', async () => {
    const updateId = await draft('Before the lock');

    signIn(owner);
    await withLockedTeam(teamId, async () => {
      expect(
        await createDealUpdate({
          dealId,
          subject: 'Locked',
          body: 'Out',
          picks: TO_LENDERS,
        }),
      ).toEqual({ ok: false, refusal: READ_ONLY });
      expect(
        await editDealUpdate({
          updateId,
          subject: 'Locked',
          body: 'Out',
          picks: TO_LENDERS,
        }),
      ).toEqual({ ok: false, refusal: READ_ONLY });
      expect(await submitDealUpdate({ updateId })).toEqual({
        ok: false,
        refusal: READ_ONLY,
      });
    });
  });

  it('tells who may write and whether anyone else can approve', async () => {
    expect(await board(owner)).toEqual(
      expect.objectContaining({
        canManage: true,
        canApprove: true,
        hasOtherApprover: false,
      }),
    );
    expect(await board(member)).toEqual(
      expect.objectContaining({ canManage: false, canApprove: false }),
    );

    const approver = await provisionPerson();
    await admin
      .from('accounts_memberships')
      .insert({
        account_id: teamId,
        user_id: approver.userId,
        account_role: 'admin',
      })
      .throwOnError();

    expect(await board(owner)).toEqual(
      expect.objectContaining({ hasOtherApprover: true }),
    );
  });
});

interface Trigger {
  name: string;
  to: { subscriberId: string; email: string };
  payload: { updateId: string };
}

async function withFakeNovu(run: (triggers: Trigger[]) => Promise<void>) {
  const triggers: Trigger[] = [];
  const server = createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => {
      if (request.url === '/v1/events/trigger') {
        triggers.push(JSON.parse(raw) as Trigger);
      }
      response
        .writeHead(201, { 'content-type': 'application/json' })
        .end('{"data":{}}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  vi.stubEnv('NOVU_API_KEY', 'novu-key');
  vi.stubEnv(
    'NOVU_API_URL',
    `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  );

  try {
    await run(triggers);
  } finally {
    vi.stubEnv('NOVU_API_KEY', undefined);
    vi.stubEnv('NOVU_API_URL', undefined);
    server.close();
  }
}

describe('telling approvers an update awaits approval', () => {
  let approver: Person;
  let dealLink: string;

  beforeAll(async () => {
    approver = await provisionPerson();
    await admin
      .from('accounts_memberships')
      .insert({
        account_id: teamId,
        user_id: approver.userId,
        account_role: 'admin',
      })
      .throwOnError();
    await admin
      .from('accounts')
      .update({ name: 'Avery Author' })
      .eq('primary_owner_user_id', owner.userId)
      .eq('is_personal_account', true)
      .throwOnError();
    const { data: team } = await admin
      .from('accounts')
      .select('slug')
      .eq('id', teamId)
      .single()
      .throwOnError();
    dealLink = `/home/${team.slug}/deals/${dealId}`;
  });

  async function notices(person: Person, subject: string) {
    const { data } = await admin
      .from('notifications')
      .select('body, link')
      .eq('recipient_user_id', person.userId)
      .like('body', `%${subject}%`)
      .throwOnError();

    return data;
  }

  async function submitted(subject: string, onDeal = dealId) {
    const updateId = await draft(subject, onDeal);

    signIn(owner);
    expect(await submitDealUpdate({ updateId })).toEqual({
      ok: true,
      value: undefined,
    });

    return updateId;
  }

  it('tells every other approver in-app, linking to the update on the deal', async () => {
    const updateId = await submitted('Payoff letter');

    expect(await notices(approver, 'Payoff letter')).toEqual([
      {
        body: 'Avery Author submitted an update on Seller room deal for approval: Payoff letter',
        link: `${dealLink}#deal-update-${updateId}`,
      },
    ]);
    expect(await notices(owner, 'Payoff letter')).toEqual([]);
    expect(await notices(member, 'Payoff letter')).toEqual([]);
  });

  it('emails every other approver through Novu', async () => {
    await withFakeNovu(async (triggers) => {
      const updateId = await submitted('Estoppel');

      expect(triggers).toContainEqual(
        expect.objectContaining({
          name: 'deal-update-submitted',
          to: { subscriberId: approver.userId, email: approver.email },
          payload: { updateId },
        }),
      );
      expect(triggers.map((trigger) => trigger.to.subscriberId)).not.toContain(
        owner.userId,
      );
    });
  });

  it('still submits, with the in-app notice, when Novu is not configured', async () => {
    await submitted('No Novu');

    expect(await notices(approver, 'No Novu')).toHaveLength(1);
  });

  it('still submits, with the in-app notice, when Novu cannot be reached', async () => {
    vi.stubEnv('NOVU_API_KEY', 'novu-key');
    vi.stubEnv('NOVU_API_URL', 'http://127.0.0.1:9');

    try {
      await submitted('Novu down');
    } finally {
      vi.stubEnv('NOVU_API_KEY', undefined);
      vi.stubEnv('NOVU_API_URL', undefined);
    }

    expect(await notices(approver, 'Novu down')).toHaveLength(1);
  });
});

describe('drafting an update about a shared date change', () => {
  let timelineDealId: string;

  async function timelineDraft(from: string | null, to: string | null) {
    signIn(owner);
    const created = await draftTimelineUpdate({
      dealId: timelineDealId,
      milestone: 'Closing',
      from,
      to,
    });

    if (!created.ok) {
      throw new Error(created.refusal);
    }

    const { updates } = await loadDealUpdates({
      dealId: timelineDealId,
      accountId: teamId,
      roster: await loadDealPeople({
        dealId: timelineDealId,
        accountId: teamId,
      }),
    });

    return updates.find((update) => update.id === created.value)!;
  }

  beforeAll(async () => {
    timelineDealId = await newDeal(teamId, owner);
    signIn(owner);

    for (const contact of [
      {
        name: 'Sam Seller',
        side: 'seller',
        role: 'principal',
        email: 'sam@seller.test',
      },
      {
        name: 'Sue Counsel',
        side: 'seller',
        role: 'attorney',
        email: 'sue@counsel.test',
      },
      { name: 'Bo Counsel', side: 'buyer', role: 'attorney', email: '' },
      {
        name: 'Bea Broker',
        side: 'seller',
        role: 'broker',
        email: 'bea@broker.test',
      },
    ] as const) {
      await addDealContact({
        dealId: timelineDealId,
        company: '',
        phone: '',
        ...contact,
      });
    }
  });

  it('saves a draft naming the old and new date, preselecting the outside groups someone can be emailed in', async () => {
    expect(await timelineDraft('2026-11-01', '2026-11-15')).toEqual(
      expect.objectContaining({
        subject: 'Timeline update: Closing',
        body: 'Closing moved from Nov 1, 2026 to Nov 15, 2026.',
        picks: { groups: ['sellers', 'sellers_counsel'], people: [] },
        status: 'draft',
        mine: true,
      }),
    );
  });

  it('words a first date, a cleared date and an unchanged date', async () => {
    expect((await timelineDraft(null, '2026-11-15')).body).toBe(
      'Closing is now set for Nov 15, 2026.',
    );
    expect((await timelineDraft('2026-11-01', null)).body).toBe(
      'Closing (was Nov 1, 2026) is no longer set.',
    );
    expect((await timelineDraft('2026-10-14', '2026-10-14')).body).toBe(
      'Closing is set for Oct 14, 2026.',
    );
  });

  it('refuses drafting while the team is locked', async () => {
    signIn(owner);
    await withLockedTeam(teamId, async () => {
      expect(
        await draftTimelineUpdate({
          dealId: timelineDealId,
          milestone: 'Closing',
          from: '2026-11-01',
          to: '2026-11-15',
        }),
      ).toEqual({ ok: false, refusal: READ_ONLY });
    });
  });
});
