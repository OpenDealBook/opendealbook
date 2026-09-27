'use server';

import { enhanceAction } from '@tuckin/next/actions';
import { getSupabaseServerAdminClient } from '@tuckin/supabase/server';

import { assertSuperAdmin } from './assert-super-admin';
import {
  AccountIdSchema,
  ListAccountsSchema,
  UserIdSchema,
  type AccountIdInput,
  type ListAccountsInput,
  type UserIdInput,
} from './schemas';

const BAN_DURATION = '876000h';

export const listAccountsAction = enhanceAction(
  async (input: ListAccountsInput, user) => {
    assertSuperAdmin(user);

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
  async (input: AccountIdInput, user) => {
    assertSuperAdmin(user);

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
  async (input: AccountIdInput, user) => {
    assertSuperAdmin(user);

    await getSupabaseServerAdminClient()
      .from('accounts')
      .delete()
      .eq('id', input.accountId);
  },
  { schema: AccountIdSchema },
);

export const banUserAction = enhanceAction(
  async (input: UserIdInput, user) => {
    assertSuperAdmin(user);

    await getSupabaseServerAdminClient().auth.admin.updateUserById(
      input.userId,
      { ban_duration: BAN_DURATION },
    );
  },
  { schema: UserIdSchema },
);

export const reactivateUserAction = enhanceAction(
  async (input: UserIdInput, user) => {
    assertSuperAdmin(user);

    await getSupabaseServerAdminClient().auth.admin.updateUserById(
      input.userId,
      { ban_duration: 'none' },
    );
  },
  { schema: UserIdSchema },
);
