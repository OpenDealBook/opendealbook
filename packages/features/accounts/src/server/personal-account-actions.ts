'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { enhanceAction } from '@odb/next/actions';
import {
  getSupabaseServerAdminClient,
  getSupabaseServerClient,
} from '@odb/supabase/server';

import { UpdateAccountNameSchema } from '../schema/update-account-name.schema';
import { UpdateEmailSchema } from '../schema/update-email.schema';
import { UpdatePasswordSchema } from '../schema/update-password.schema';

export const updatePersonalAccountNameAction = enhanceAction(
  async (data, user) => {
    const client = getSupabaseServerClient();

    await client
      .from('accounts')
      .update({ name: data.name })
      .eq('primary_owner_user_id', user.id)
      .eq('is_personal_account', true)
      .throwOnError();

    revalidatePath('/', 'layout');

    return { success: true };
  },
  { auth: true, schema: UpdateAccountNameSchema },
);

export const updateEmailAction = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { error } = await client.auth.updateUser({ email: data.email });

    if (error) {
      throw error;
    }

    return { success: true };
  },
  { auth: true, schema: UpdateEmailSchema },
);

export const updatePasswordAction = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { error } = await client.auth.updateUser({
      password: data.newPassword,
    });

    if (error) {
      throw error;
    }

    return { success: true };
  },
  { auth: true, schema: UpdatePasswordSchema },
);

export const deletePersonalAccountAction = enhanceAction(
  async (_data: void, user) => {
    await getSupabaseServerAdminClient().auth.admin.deleteUser(user.id);

    await getSupabaseServerClient().auth.signOut();

    revalidatePath('/', 'layout');

    redirect('/');
  },
  { auth: true },
);
