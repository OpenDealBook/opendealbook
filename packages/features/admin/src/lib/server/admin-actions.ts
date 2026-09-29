'use server';

import type { User } from '@supabase/supabase-js';

import { enhanceAction } from '@odb/next/actions';
import {
  getSupabaseServerAdminClient,
  getSupabaseServerClient,
} from '@odb/supabase/server';

import {
  AccountIdSchema,
  ListAccountsSchema,
  UserIdSchema,
  type AccountIdInput,
  type ListAccountsInput,
  type UserIdInput,
} from './schemas';
import { recordAdminAction } from './utils/audit';
import { assertSuperAdmin } from './utils/super-admin';
import { assertTargetUserMutable } from './utils/target-guard';

const BAN_DURATION = '876000h';

export const listAccountsAction = enhanceAction(
  async (input: ListAccountsInput) => {
    await assertSuperAdmin(getSupabaseServerClient());

    const client = getSupabaseServerAdminClient();
    const offset = input.page * input.perPage;

    const base = client
      .from('accounts')
      .select('id, name, email, created_at', { count: 'exact' });

    const filtered = input.search
      ? base.ilike('name', `%${input.search}%`)
      : base;

    const { data, count } = await filtered
      .order('created_at', { ascending: false })
      .range(offset, offset + input.perPage - 1);

    return { accounts: data ?? [], count: count ?? 0 };
  },
  { schema: ListAccountsSchema },
);

export const getAccountDetailAction = enhanceAction(
  async (input: AccountIdInput) => {
    await assertSuperAdmin(getSupabaseServerClient());

    const client = getSupabaseServerAdminClient();

    const { data: account } = await client
      .from('accounts')
      .select('*')
      .eq('id', input.accountId)
      .single();

    const { data: memberships } = await client
      .from('accounts_memberships')
      .select('user_id, account_role, created_at')
      .eq('account_id', input.accountId);

    const { data: subscription } = await client
      .from('subscriptions')
      .select('*')
      .eq('account_id', input.accountId)
      .maybeSingle();

    return { account, memberships: memberships ?? [], subscription };
  },
  { schema: AccountIdSchema },
);

export const deleteAccountAction = enhanceAction(
  async (input: AccountIdInput, user: User) => {
    await assertSuperAdmin(getSupabaseServerClient());

    const client = getSupabaseServerAdminClient();

    const { data: account } = await client
      .from('accounts')
      .select('primary_owner_user_id')
      .eq('id', input.accountId)
      .single();

    await assertTargetUserMutable(client, user.id, account!.primary_owner_user_id);

    await client.from('accounts').delete().eq('id', input.accountId);

    await recordAdminAction(client, {
      actorUserId: user.id,
      action: 'account.delete',
      targetType: 'account',
      targetId: input.accountId,
    });
  },
  { schema: AccountIdSchema },
);

export const banUserAction = enhanceAction(
  async (input: UserIdInput, user: User) => {
    await assertSuperAdmin(getSupabaseServerClient());

    const client = getSupabaseServerAdminClient();

    await assertTargetUserMutable(client, user.id, input.userId);

    await client.auth.admin.updateUserById(input.userId, {
      ban_duration: BAN_DURATION,
    });

    await recordAdminAction(client, {
      actorUserId: user.id,
      action: 'user.ban',
      targetType: 'user',
      targetId: input.userId,
    });
  },
  { schema: UserIdSchema },
);

export const reactivateUserAction = enhanceAction(
  async (input: UserIdInput, user: User) => {
    await assertSuperAdmin(getSupabaseServerClient());

    const client = getSupabaseServerAdminClient();

    await client.auth.admin.updateUserById(input.userId, {
      ban_duration: 'none',
    });

    await recordAdminAction(client, {
      actorUserId: user.id,
      action: 'user.reactivate',
      targetType: 'user',
      targetId: input.userId,
    });
  },
  { schema: UserIdSchema },
);
