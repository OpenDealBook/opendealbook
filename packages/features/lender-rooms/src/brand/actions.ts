'use server';

import { z } from 'zod';

import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { refusableAction } from '../actions/refusable-action';
import { Refusal } from '../actions/refusal';
import { refuseWhileTeamLocked } from '../actions/team-lock';
import { brandLogoUrl } from './logo-url';
import { BRAND_BUCKET, brandLogoPath, lookupBrand } from './lookup-brand';
import { pinnedRequest } from './pinned-request';
import { sniffImageType } from './sniff-image';

import { lookup } from 'node:dns/promises';

const MANUAL_LOGO_BYTE_LIMIT = 512 * 1024;
const DEAL_TEAM_ONLY = 'Only the deal team can do that';

async function requireDealTeam(dealId: string) {
  const { data: deal } = await getSupabaseServerAdminClient()
    .from('deal')
    .select('account_id')
    .eq('id', dealId)
    .maybeSingle()
    .throwOnError();

  if (!deal) {
    throw new Refusal(DEAL_TEAM_ONLY);
  }

  const { data: managesDeal } = await getSupabaseServerClient()
    .rpc('manages_deal_in_account', {
      deal_id: dealId,
      account_id: deal.account_id,
    })
    .throwOnError();

  if (!managesDeal) {
    throw new Refusal(DEAL_TEAM_ONLY);
  }
}

export const lookupLenderBrand = refusableAction(
  async (input) => {
    await requireDealTeam(input.dealId);

    const brand = await lookupBrand(input.url, {
      lookup: (hostname) => lookup(hostname, { all: true }),
      request: pinnedRequest,
    });

    return (
      brand && {
        ...brand,
        logoUrl: brand.logoPath ? await brandLogoUrl(brand.logoPath) : null,
      }
    );
  },
  { schema: z.object({ dealId: z.uuid(), url: z.string() }) },
);

export const setManualLenderLogo = refusableAction(
  async (input) => {
    await requireDealTeam(input.dealId);

    const client = getSupabaseServerClient();

    const { data: canManage } = await client
      .rpc('can_manage_lender_room', { room_id: input.roomId })
      .throwOnError();

    if (!canManage) {
      throw new Refusal('Not allowed to manage this lender room');
    }

    const { data: room } = await client
      .from('lender_room')
      .select('account_id, brand_domain')
      .eq('id', input.roomId)
      .single()
      .throwOnError();

    await refuseWhileTeamLocked(room.account_id);

    if (!room.brand_domain) {
      throw new Refusal('This room has no website, so a logo cannot be added');
    }

    const bytes = new Uint8Array(await input.file.arrayBuffer());
    const contentType =
      bytes.byteLength <= MANUAL_LOGO_BYTE_LIMIT ? sniffImageType(bytes) : null;

    if (!contentType) {
      throw new Refusal('The logo must be an image of at most 512 KiB');
    }

    const admin = getSupabaseServerAdminClient();

    const { data: cached } = await admin
      .from('lender_brand')
      .select('logo_path')
      .eq('domain', room.brand_domain)
      .single()
      .throwOnError();

    if (cached.logo_path) {
      return;
    }

    const logoPath = brandLogoPath(room.brand_domain);

    const { error } = await admin.storage
      .from(BRAND_BUCKET)
      .upload(logoPath, bytes, { contentType, upsert: true });

    if (error) {
      throw error;
    }

    await admin
      .from('lender_brand')
      .update({ logo_path: logoPath })
      .eq('domain', room.brand_domain)
      .throwOnError();
  },
  {
    schema: z.object({
      dealId: z.uuid(),
      roomId: z.uuid(),
      file: z.instanceof(File),
    }),
  },
);
