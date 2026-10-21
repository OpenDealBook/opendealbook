import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

import { type DiffSegment, diffVersions } from '../redline/diff';
import { docxText } from '../redline/docx-text';
import {
  type ContractVersionSummary,
  downloadFile,
  versionFiles,
} from './queries';

export type ContractVersionView = ContractVersionSummary & {
  hasDocx: boolean;
  hasPdf: boolean;
  redline: DiffSegment[] | null;
};

// The versions come from a read under the viewer's own access, which is what
// entitles the service role to read their files.
export async function contractVersionViews(
  admin: SupabaseClient<Database>,
  versions: ContractVersionSummary[],
): Promise<ContractVersionView[]> {
  const files = await versionFiles(
    admin,
    versions.map((version) => version.id),
  );
  const texts = await Promise.all(
    files.map(({ docx }) =>
      docx === null ? null : downloadFile(admin, docx).then(readableText),
    ),
  );

  return versions.map((version, index) => {
    const before = index === 0 ? null : texts[index - 1]!;
    const after = texts[index]!;

    return {
      ...version,
      hasDocx: files[index]!.docx !== null,
      hasPdf: files[index]!.pdf !== null,
      redline:
        before === null || after === null ? null : diffVersions(before, after),
    };
  });
}

// One unreadable Word file costs that version its redline, not the page.
async function readableText(bytes: Uint8Array): Promise<string | null> {
  try {
    return await docxText(bytes);
  } catch {
    return null;
  }
}
