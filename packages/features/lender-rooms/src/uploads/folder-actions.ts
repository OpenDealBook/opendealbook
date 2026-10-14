'use server';

import { z } from 'zod';

import { deterministicUuid } from '@odb/contracts/esign';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { refusableAction } from '../actions/refusable-action';
import { Refusal } from '../actions/refusal';
import { recordActivity } from '../activity/record-activity';
import { requireSpaceFolder, type Space } from './access';
import { isUsableFolderName, planFolderTree } from './folder-tree';
import {
  countFoldersInSpace,
  createFolderPaths,
  FOLDER_CANNOT_BE_ADDED,
  matchingLiterally,
} from './folders';
import type { Admin } from './objects';
import {
  MAX_DIRECTORY_LEVELS,
  MAX_FILES_AND_FOLDERS_AT_ONCE,
  MAX_FOLDERS_IN_SPACE,
} from './paths';
import { inRoomOrPackage } from './targets';

const ROOT_FOLDER = 1;

async function requireUnderFolderLimit(
  admin: Admin,
  space: Space,
  newFolders: number,
) {
  const foldersInSpace = await countFoldersInSpace(admin, space);

  if (foldersInSpace + newFolders > MAX_FOLDERS_IN_SPACE) {
    throw new Refusal(
      space.roomId
        ? 'This room has reached its limit of 5,000 folders'
        : 'The lender package has reached its limit of 5,000 folders',
    );
  }
}

async function recordFolderCreated(
  space: Space,
  admin: Admin,
  folderId: string,
) {
  if (space.roomId) {
    await recordActivity({
      client: getSupabaseServerClient(),
      admin,
      roomId: space.roomId,
      action: 'folder_created',
      folderId,
    });
  }
}

function tooManyFolders(rootName: string): string {
  return `"${rootName}" has too many folders to add at once (limit 2,000)`;
}

export const createFolder = refusableAction(
  async (input): Promise<string> => {
    const space = await requireSpaceFolder(
      input,
      input.parentFolderId,
      'Folders',
    );

    if (input.name === '') {
      throw new Refusal('Enter a folder name');
    }

    if (!isUsableFolderName(input.name)) {
      throw new Refusal(`"${input.name}" cannot be used as a folder name`);
    }

    if (space.folderLevel + ROOT_FOLDER > MAX_DIRECTORY_LEVELS) {
      throw new Refusal('Folders cannot be nested more than 20 levels deep');
    }

    const admin = getSupabaseServerAdminClient();
    const sameName = await admin
      .from('dr_folder')
      .select('name')
      .eq('parent_id', input.parentFolderId)
      .ilike('name', matchingLiterally(input.name))
      .limit(1)
      .maybeSingle()
      .throwOnError();

    if (sameName.data) {
      throw new Refusal(
        `A folder named "${sameName.data.name}" is already here`,
      );
    }

    await requireUnderFolderLimit(admin, space, ROOT_FOLDER);

    const folder = await admin
      .from('dr_folder')
      .insert({
        account_id: space.account_id,
        deal_id: space.deal_id,
        parent_id: input.parentFolderId,
        name: input.name,
      })
      .select('id')
      .single()
      .throwOnError();

    await recordFolderCreated(space, admin, folder.data.id);

    return folder.data.id;
  },
  {
    schema: inRoomOrPackage({
      parentFolderId: z.uuid(),
      name: z.string().trim(),
    }),
  },
);

export const createFolderTree = refusableAction(
  async (
    input,
  ): Promise<{
    rootFolderId: string | null;
    folderIds: Record<string, string>;
  }> => {
    const space = await requireSpaceFolder(
      input,
      input.parentFolderId,
      'Folders',
    );
    const plan = planFolderTree(input.rootName, input.paths, space.folderLevel);

    if (plan.kind === 'skipped') {
      return { rootFolderId: null, folderIds: {} };
    }

    if (plan.kind === 'refused') {
      switch (plan.reason) {
        case 'too-many':
          throw new Refusal(tooManyFolders(input.rootName));
        case 'too-deep':
          throw new Refusal(
            `"${input.rootName}" has folders nested too deeply (limit 20 levels)`,
          );
        case 'unusable':
          throw new Refusal(FOLDER_CANNOT_BE_ADDED);
      }
    }

    const seed = crypto.randomUUID();
    const idAt = (path: string) =>
      deterministicUuid(`${seed}\n${path.toLowerCase()}`);
    const underRoot = (directory: string) => `${input.rootName}/${directory}`;

    const admin = getSupabaseServerAdminClient();
    const rootFolderId = idAt(input.rootName);

    await requireUnderFolderLimit(
      admin,
      space,
      ROOT_FOLDER + plan.directories.length,
    );

    await createFolderPaths(admin, space, {
      parentFolderId: input.parentFolderId,
      rootPath: input.rootName,
      descendantPaths: plan.directories.map(underRoot),
      idAt,
    });
    await recordFolderCreated(space, admin, rootFolderId);

    return {
      rootFolderId,
      folderIds: Object.fromEntries(
        [...plan.keyedPaths].map(([key, directory]) => [
          key,
          idAt(underRoot(directory)),
        ]),
      ),
    };
  },
  {
    schema: inRoomOrPackage({
      parentFolderId: z.uuid(),
      rootName: z.string().trim(),
      paths: z.array(z.string()),
    }).superRefine((input, context) => {
      if (input.paths.length > MAX_FILES_AND_FOLDERS_AT_ONCE) {
        context.addIssue({
          code: 'custom',
          message: tooManyFolders(input.rootName),
        });
      }
    }),
  },
);
