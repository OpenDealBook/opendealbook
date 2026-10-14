import 'server-only';
import type { Tables } from '@odb/supabase';

import { Refusal } from '../actions/refusal';
import type { DealScope, Space } from './access';
import { isUsableFolderName } from './folder-tree';
import type { Admin } from './objects';

export interface FolderPaths {
  parentFolderId: string;
  rootPath: string;
  descendantPaths: string[];
  idAt: (path: string) => string;
}

type FolderRow = Pick<
  Tables<'dr_folder'>,
  'id' | 'account_id' | 'deal_id' | 'parent_id' | 'name'
>;

export const FOLDER_CANNOT_BE_ADDED = 'That folder cannot be added';

const LIKE_WILDCARD = /[\\%_]/g;

export function matchingLiterally(text: string): string {
  return text.replace(LIKE_WILDCARD, '\\$&');
}

export function availableFolderName(name: string, taken: string[]): string {
  const takenLowercase = taken.map((other) => other.toLowerCase());
  let candidate = name;

  for (
    let copy = 2;
    takenLowercase.includes(candidate.toLowerCase());
    copy += 1
  ) {
    candidate = `${name} (${copy})`;
  }

  return candidate;
}

export async function createFolderPaths(
  admin: Admin,
  scope: DealScope,
  paths: FolderPaths,
): Promise<void> {
  const siblings = await admin
    .from('dr_folder')
    .select('name')
    .eq('parent_id', paths.parentFolderId)
    .ilike('name', `${matchingLiterally(paths.rootPath)}%`)
    .neq('id', paths.idAt(paths.rootPath))
    .throwOnError();
  const rootName = availableFolderName(
    paths.rootPath,
    siblings.data.map((folder) => folder.name),
  );

  if (!isUsableFolderName(rootName)) {
    throw new Refusal(FOLDER_CANNOT_BE_ADDED);
  }

  const rows = new Map<string, FolderRow>();

  rows.set(paths.idAt(paths.rootPath), {
    id: paths.idAt(paths.rootPath),
    account_id: scope.account_id,
    deal_id: scope.deal_id,
    parent_id: paths.parentFolderId,
    name: rootName,
  });

  for (const path of paths.descendantPaths) {
    const lastSlash = path.lastIndexOf('/');
    const id = paths.idAt(path);

    if (!rows.has(id)) {
      rows.set(id, {
        id,
        account_id: scope.account_id,
        deal_id: scope.deal_id,
        parent_id: paths.idAt(path.slice(0, lastSlash)),
        name: path.slice(lastSlash + 1),
      });
    }
  }

  await admin
    .from('dr_folder')
    .upsert([...rows.values()], { onConflict: 'id', ignoreDuplicates: true })
    .throwOnError();
}

export async function countFoldersInSpace(
  admin: Admin,
  space: Pick<Space, 'deal_id' | 'roomId'>,
): Promise<number> {
  const count = space.roomId
    ? await admin
        .rpc('lender_room_folder_count', { room_id: space.roomId })
        .throwOnError()
    : await admin
        .rpc('lender_package_folder_count', { deal_id: space.deal_id })
        .throwOnError();

  return count.data;
}
