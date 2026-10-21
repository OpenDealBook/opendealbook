import 'server-only';
import { TEAM_READ_ONLY } from '@odb/next';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { Refusal } from '../actions/refusal';
import { refuseWhileTeamLocked } from '../actions/team-lock';
import { MAX_DIRECTORY_LEVELS } from './paths';
import type { SpaceTarget } from './targets';

export async function requireRoomAccess(roomId: string) {
  const client = getSupabaseServerClient();
  const [member, manager] = await Promise.all([
    client.rpc('is_lender_room_member', { room_id: roomId }).throwOnError(),
    client.rpc('can_manage_lender_room', { room_id: roomId }).throwOnError(),
  ]);

  if (!member.data && !manager.data) {
    throw new Refusal('You do not have access to this room');
  }

  const room = await getSupabaseServerAdminClient()
    .from('lender_room')
    .select('account_id, deal_id, private_folder_id')
    .eq('id', roomId)
    .single()
    .throwOnError();

  return { ...room.data, isDealTeam: manager.data };
}

async function requireSellerRoomAccess(sellerRoomId: string) {
  const client = getSupabaseServerClient();
  const [member, manager] = await Promise.all([
    client
      .rpc('is_seller_room_member', { room_id: sellerRoomId })
      .throwOnError(),
    client
      .rpc('can_manage_seller_room', { room_id: sellerRoomId })
      .throwOnError(),
  ]);

  if (!member.data && !manager.data) {
    throw new Refusal('You do not have access to this room');
  }

  const room = await getSupabaseServerAdminClient()
    .from('seller_room')
    .select('account_id, deal_id, uploads_folder_id')
    .eq('id', sellerRoomId)
    .single()
    .throwOnError();

  const [seller, readOnlyReason] = await Promise.all([
    client
      .rpc('is_deal_seller_room_member', { deal_id: room.data.deal_id })
      .throwOnError(),
    client
      .rpc('seller_side_read_only_reason', { deal_id: room.data.deal_id })
      .throwOnError(),
  ]);

  if (readOnlyReason.data) {
    throw new Refusal(readOnlyReason.data);
  }

  return { ...room.data, isDealTeam: manager.data, isSeller: seller.data };
}

export interface Space {
  account_id: string;
  deal_id: string;
  containerFolderId: string;
  roomId: string | null;
  sellerRoomId: string | null;
  counselDealId: string | null;
  sellerCounselDealId: string | null;
}

const NO_PACKAGE_ACCESS = 'You do not have access to this lender package';

export interface PackageRoot {
  dealId: string;
  accountId: string;
  masterFolderId: string;
}

export async function packageRoot(dealId: string): Promise<PackageRoot> {
  const admin = getSupabaseServerAdminClient();
  const deal = await admin
    .from('deal')
    .select('account_id')
    .eq('id', dealId)
    .maybeSingle()
    .throwOnError();

  if (!deal.data) {
    throw new Refusal(NO_PACKAGE_ACCESS);
  }

  const manages = await getSupabaseServerClient()
    .rpc('manages_deal_in_account', {
      deal_id: dealId,
      account_id: deal.data.account_id,
    })
    .throwOnError();

  if (!manages.data) {
    throw new Refusal(NO_PACKAGE_ACCESS);
  }

  const lenderPackage = await admin
    .from('lender_package')
    .select('master_folder_id')
    .eq('deal_id', dealId)
    .maybeSingle()
    .throwOnError();

  if (!lenderPackage.data) {
    throw new Refusal('This deal has no lender package yet');
  }

  return {
    dealId,
    accountId: deal.data.account_id,
    masterFolderId: lenderPackage.data.master_folder_id,
  };
}

export async function requireSpace(target: SpaceTarget): Promise<Space> {
  if ('dealId' in target) {
    const root = await packageRoot(target.dealId);

    await refuseWhileTeamLocked(root.accountId);

    return {
      account_id: root.accountId,
      deal_id: root.dealId,
      containerFolderId: root.masterFolderId,
      roomId: null,
      sellerRoomId: null,
      counselDealId: null,
      sellerCounselDealId: null,
    };
  }

  if ('counselDealId' in target) {
    return requireBuyerCounselSpace(target.counselDealId);
  }

  if ('sellerCounselDealId' in target) {
    return requireSellerCounselSpace(target.sellerCounselDealId);
  }

  if ('sellerRoomId' in target) {
    const room = await requireSellerRoomAccess(target.sellerRoomId);

    if (room.isDealTeam) {
      await refuseWhileTeamLocked(room.account_id);
    }

    // Whoever is let in without being the seller or the team is seller's
    // counsel, whose uploads stop while the team is locked. Counsel are not
    // members, so the lock is read with the service role.
    if (!room.isDealTeam && !room.isSeller) {
      const { data: locked } = await getSupabaseServerAdminClient()
        .rpc('is_account_locked', { target_account_id: room.account_id })
        .throwOnError();

      if (locked) {
        throw new Refusal(TEAM_READ_ONLY);
      }
    }

    return {
      account_id: room.account_id,
      deal_id: room.deal_id,
      containerFolderId: room.uploads_folder_id,
      roomId: null,
      sellerRoomId: target.sellerRoomId,
      counselDealId: null,
      sellerCounselDealId: null,
    };
  }

  const room = await requireRoomAccess(target.roomId);

  if (room.isDealTeam) {
    await refuseWhileTeamLocked(room.account_id);
  }

  return {
    account_id: room.account_id,
    deal_id: room.deal_id,
    containerFolderId: room.private_folder_id,
    roomId: target.roomId,
    sellerRoomId: null,
    counselDealId: null,
    sellerCounselDealId: null,
  };
}

// Counsel are not members, so the deal, the lock and the folder are read and
// made with the service role once the caller is known to be buyer's counsel.
async function requireBuyerCounselSpace(dealId: string): Promise<Space> {
  const { data: counsel } = await getSupabaseServerClient()
    .rpc('is_deal_counsel', { deal_id: dealId, side: 'buyer' })
    .throwOnError();

  if (!counsel) {
    throw new Refusal('You do not have access to this deal');
  }

  const admin = getSupabaseServerAdminClient();
  const { data: deal } = await admin
    .from('deal')
    .select('account_id')
    .eq('id', dealId)
    .single()
    .throwOnError();
  const { data: locked } = await admin
    .rpc('is_account_locked', { target_account_id: deal.account_id })
    .throwOnError();

  if (locked) {
    throw new Refusal(TEAM_READ_ONLY);
  }

  const { data: folderId } = await admin
    .rpc('ensure_counsel_uploads_folder', { deal_id: dealId })
    .throwOnError();

  return {
    account_id: deal.account_id,
    deal_id: dealId,
    containerFolderId: folderId,
    roomId: null,
    sellerRoomId: null,
    counselDealId: dealId,
    sellerCounselDealId: null,
  };
}

// The Seller's counsel folder is the seller side's alone: the seller and
// seller's counsel. Counsel stop while the team is locked; the seller does
// not, as in the seller room.
async function requireSellerCounselSpace(dealId: string): Promise<Space> {
  const client = getSupabaseServerClient();
  const [{ data: sellerSide }, { data: isSeller }, { data: readOnlyReason }] =
    await Promise.all([
      client.rpc('is_deal_seller_side', { deal_id: dealId }).throwOnError(),
      client
        .rpc('is_deal_seller_room_member', { deal_id: dealId })
        .throwOnError(),
      client
        .rpc('seller_side_read_only_reason', { deal_id: dealId })
        .throwOnError(),
    ]);

  if (!sellerSide) {
    throw new Refusal('You do not have access to this deal');
  }

  if (readOnlyReason) {
    throw new Refusal(readOnlyReason);
  }

  const admin = getSupabaseServerAdminClient();
  const { data: folder } = await admin
    .from('seller_counsel_folder')
    .select('account_id, folder_id')
    .eq('deal_id', dealId)
    .single()
    .throwOnError();

  if (!isSeller) {
    const { data: locked } = await admin
      .rpc('is_account_locked', { target_account_id: folder.account_id })
      .throwOnError();

    if (locked) {
      throw new Refusal(TEAM_READ_ONLY);
    }
  }

  return {
    account_id: folder.account_id,
    deal_id: dealId,
    containerFolderId: folder.folder_id,
    roomId: null,
    sellerRoomId: null,
    counselDealId: null,
    sellerCounselDealId: dealId,
  };
}

export async function levelBelowContainer(
  space: Pick<Space, 'deal_id' | 'containerFolderId'>,
  folderId: string,
): Promise<number | null> {
  const admin = getSupabaseServerAdminClient();
  let current = folderId;

  for (let level = 0; level <= MAX_DIRECTORY_LEVELS; level += 1) {
    if (current === space.containerFolderId) {
      return level;
    }

    const folder = await admin
      .from('dr_folder')
      .select('parent_id')
      .eq('id', current)
      .eq('deal_id', space.deal_id)
      .maybeSingle()
      .throwOnError();

    if (!folder.data?.parent_id) {
      return null;
    }

    current = folder.data.parent_id;
  }

  return null;
}

export async function requireSpaceFolder(
  target: SpaceTarget,
  folderId: string,
  added: 'Files' | 'Folders',
) {
  const space = await requireSpace(target);
  const folderLevel = await levelBelowContainer(space, folderId);

  if (folderLevel === null) {
    throw new Refusal(
      space.sellerRoomId
        ? `${added} can only be added to the room's uploads`
        : space.counselDealId
          ? `${added} can only be added to the Buyer's counsel folder`
          : space.sellerCounselDealId
            ? `${added} can only be added to the Seller's counsel folder`
            : space.roomId
              ? `${added} can only be added to the room's own folder`
              : `${added} can only be added to the lender package`,
    );
  }

  return { ...space, folderLevel };
}

export async function isWithinFolder(
  dealId: string,
  folderId: string,
  containerFolderId: string,
): Promise<boolean> {
  return (
    (await levelBelowContainer(
      { deal_id: dealId, containerFolderId },
      folderId,
    )) !== null
  );
}

export type DealScope = Pick<Space, 'account_id' | 'deal_id'>;

export function uploadLedger(
  space: Pick<Space, 'sellerRoomId' | 'counselDealId' | 'sellerCounselDealId'>,
) {
  return space.sellerRoomId
    ? ('seller_upload' as const)
    : space.counselDealId || space.sellerCounselDealId
      ? ('counsel_upload' as const)
      : ('lender_upload' as const);
}
