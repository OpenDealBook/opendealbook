import 'server-only';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { Refusal } from '../actions/refusal';
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

  return room.data;
}

export interface Space {
  account_id: string;
  deal_id: string;
  containerFolderId: string;
  roomId: string | null;
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

    return {
      account_id: root.accountId,
      deal_id: root.dealId,
      containerFolderId: root.masterFolderId,
      roomId: null,
    };
  }

  const room = await requireRoomAccess(target.roomId);

  return {
    account_id: room.account_id,
    deal_id: room.deal_id,
    containerFolderId: room.private_folder_id,
    roomId: target.roomId,
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
      space.roomId
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
