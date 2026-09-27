'use server';

import { enhanceAction } from '@tuckin/next/actions';
import { getSupabaseServerClient } from '@tuckin/supabase/server';

import { generateRecoveryCodes } from './generate-recovery-codes';

export const generateRecoveryCodesAction = enhanceAction(
  async (_data: void) => {
    const codes = generateRecoveryCodes();
    const client = getSupabaseServerClient();

    await client
      .rpc('replace_mfa_recovery_codes', { p_codes: codes })
      .throwOnError();

    return { codes };
  },
  { auth: true },
);

export const recoveryCodesStatusAction = enhanceAction(
  async (_data: void) => {
    const client = getSupabaseServerClient();

    const { data, error } = await client
      .rpc('mfa_recovery_codes_status')
      .single();

    if (error) {
      if (error.code === '28000') {
        return {
          total: 0,
          unused: 0,
          last_generated_at: null,
          requiresMfa: true,
        };
      }

      throw error;
    }

    return { ...data, requiresMfa: false };
  },
  { auth: true },
);
