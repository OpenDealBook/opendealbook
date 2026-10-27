import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  provisionAccount,
  type IntegrationAccount,
} from '../../test-support/integration-harness';

const mailer = vi.hoisted(() => ({
  sendEmail: vi.fn(async () => ({ messageId: 'mock-message-id' })),
}));

vi.mock('@odb/mailers', () => ({ getMailer: async () => mailer }));

import {
  emailSenderOfSellerDeliveryProblem,
  notifyTeamOfSellerDeliveryProblem,
  type SellerDeliveryProblem,
} from './notify';

async function notifySellerDeliveryProblem(problem: SellerDeliveryProblem) {
  await notifyTeamOfSellerDeliveryProblem(problem);
  await emailSenderOfSellerDeliveryProblem(problem);
}

let account: IntegrationAccount;
let teamId: string;
let teamSlug: string;
let dealId: string;
let managerId: string;
let memberId: string;

const problem = 'Sam Seller did not get the document you sent.';

async function createUser(label: string): Promise<string> {
  const { data, error } = await account.admin.auth.admin.createUser({
    email: `int-seller-${label}-${crypto.randomUUID().slice(0, 8)}@odb.test`,
    email_confirm: true,
  });
  if (error) {
    throw error;
  }
  return data.user.id;
}

async function notificationsFor(userId: string) {
  const { data } = await account.admin
    .from('notifications')
    .select('body, type, deal_id, link')
    .eq('account_id', teamId)
    .eq('recipient_user_id', userId)
    .eq('body', problem)
    .throwOnError();
  return data;
}

beforeEach(async () => {
  account = await provisionAccount();
  process.env.SELLER_DELIVERY_FROM_EMAIL = 'Deals <deals@odb.test>';
  mailer.sendEmail.mockClear();

  teamSlug = `acme-${crypto.randomUUID().slice(0, 8)}`;
  const { data: team } = await account.admin
    .rpc('create_team_account', {
      account_name: 'Acme Partners',
      user_id: account.userId,
      account_slug: teamSlug,
    })
    .throwOnError();
  teamId = team.id;

  dealId = crypto.randomUUID();
  const { data: firm } = await account.admin
    .from('firm')
    .insert({ account_id: teamId, name: 'Seller send deal' })
    .select('id')
    .single()
    .throwOnError();
  await account.admin
    .rpc('append_deal_event', {
      p_deal_id: dealId,
      p_aggregate_type: 'deal',
      p_aggregate_id: dealId,
      p_event_type: 'deal.created',
      p_payload: {
        firm_id: firm.id,
        account_id: teamId,
        owner_user_id: account.userId,
        description: 'Seller send deal',
      },
      p_actor_kind: 'service',
    })
    .throwOnError();

  managerId = await createUser('manager');
  memberId = await createUser('member');

  await account.admin
    .from('accounts_memberships')
    .insert([
      { account_id: teamId, user_id: managerId, account_role: 'admin' },
      { account_id: teamId, user_id: memberId, account_role: 'member' },
    ])
    .throwOnError();
});

afterEach(async () => {
  delete process.env.SELLER_DELIVERY_FROM_EMAIL;
  await account.admin.from('accounts').delete().eq('id', teamId);
  await account.admin.auth.admin.deleteUser(managerId);
  await account.admin.auth.admin.deleteUser(memberId);
  await account.cleanup();
});

describe('notifySellerDeliveryProblem (integration)', () => {
  it('tells the sender in-app and by email, and every other deal manager in-app', async () => {
    await notifySellerDeliveryProblem({
      accountId: teamId,
      dealId,
      senderUserId: account.userId,
      message: problem,
    });

    const link = `/home/${teamSlug}/deals/${dealId}/parties#seller-room`;
    expect(await notificationsFor(account.userId)).toEqual([
      { body: problem, type: 'error', deal_id: dealId, link },
    ]);
    expect(await notificationsFor(managerId)).toEqual([
      { body: problem, type: 'error', deal_id: dealId, link },
    ]);
    expect(await notificationsFor(memberId)).toEqual([]);

    expect(mailer.sendEmail).toHaveBeenCalledTimes(1);
    const [message] = mailer.sendEmail.mock.calls[0] as unknown as [
      { to: string; from: string; text: string },
    ];
    expect(message.to).toBe(
      (await account.admin.auth.admin.getUserById(account.userId)).data.user!
        .email,
    );
    expect(message.from).toBe('Deals <deals@odb.test>');
    expect(message.text).toContain(problem);
  });

  it('notifies in-app only when no seller sender address is set up', async () => {
    delete process.env.SELLER_DELIVERY_FROM_EMAIL;

    await notifySellerDeliveryProblem({
      accountId: teamId,
      dealId,
      senderUserId: account.userId,
      message: problem,
    });

    expect(await notificationsFor(account.userId)).toHaveLength(1);
    expect(await notificationsFor(managerId)).toHaveLength(1);
    expect(mailer.sendEmail).not.toHaveBeenCalled();
  });
});
