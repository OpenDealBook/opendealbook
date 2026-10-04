'use server';

import { z } from 'zod';

import {
  importComps,
  type ImportCompsDeps,
  type ProprietaryCompRow,
  type VendorKey,
} from '@odb/comps';
import { enhanceAction } from '@odb/next/actions';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

const importSchema = z.object({
  accountId: z.string(),
  vendor: z.enum(['dealstats', 'bizcomps', 'peercomps']),
  filename: z.string(),
  format: z.enum(['csv', 'xlsx']),
  content: z.string(),
});

const VENDOR_ALIASES: Record<VendorKey, string[]> = {
  dealstats: ['dealstats'],
  bizcomps: ['bizcomps'],
  peercomps: ['peercomps'],
};

function matchesVendor(licenseVendor: string, vendor: VendorKey): boolean {
  return VENDOR_ALIASES[vendor].includes(licenseVendor.trim().toLowerCase());
}

export const importCompsAction = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    const { data: allowed, error: permissionError } = await client.rpc(
      'has_permission',
      {
        account_id: input.accountId,
        permission_name: 'settings.manage',
        user_id: user.id,
      },
    );

    if (permissionError) {
      throw permissionError;
    }

    if (!allowed) {
      throw new Error('Not permitted to import comps for this account');
    }

    const admin = getSupabaseServerAdminClient();

    const deps: ImportCompsDeps = {
      async findActiveLicense(accountId, vendor) {
        const { data, error } = await admin
          .from('comp_license')
          .select('id, vendor, expires_at')
          .eq('account_id', accountId)
          .eq('status', 'active');

        if (error) {
          throw error;
        }

        const now = Date.now();
        const match = (data ?? []).find(
          (license) =>
            matchesVendor(license.vendor, vendor) &&
            (license.expires_at === null || Date.parse(license.expires_at) > now),
        );

        return match ? { id: match.id } : null;
      },
      async storeRawFile(path, body) {
        const { error } = await admin.storage
          .from('vendor-imports')
          .upload(path, body, { contentType: 'text/csv', upsert: true });

        if (error) {
          throw error;
        }
      },
      async upsertComps(rows: ProprietaryCompRow[]) {
        const { error } = await admin
          .from('comp')
          .upsert(rows, { onConflict: 'source,source_ref' });

        if (error) {
          throw error;
        }
      },
      async recordImport(record) {
        const { data, error } = await admin
          .from('comp_import')
          .insert(record)
          .select('id')
          .single();

        if (error) {
          throw error;
        }

        return { id: data.id };
      },
    };

    return importComps({ ...input, createdBy: user.id }, deps);
  },
  { auth: true, schema: importSchema },
);
