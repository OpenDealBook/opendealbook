import type { SupabaseClient } from '@supabase/supabase-js';
import { Zip, ZipPassThrough } from 'fflate';
import { z } from 'zod';

import type { Database } from '@odb/supabase';

import { downloadFromDataRoom } from './storage';

type Client = SupabaseClient<Database>;

interface ZipFolder {
  id: string;
  parent_id: string | null;
  name: string;
}

interface ZipDocument {
  id: string;
  folder_id: string;
  name: string;
  storage_path: string;
}

export interface ZipEntry {
  storagePath: string;
  path: string;
}

const FORM_CONTENT_TYPE =
  /^(multipart\/form-data|application\/x-www-form-urlencoded)/i;

const documentIdsSchema = z.array(z.uuid()).min(1);

export async function readZipRequest(
  request: Request,
): Promise<{ documentIds: string[] } | Response> {
  const ownHost =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host');

  if (URL.parse(String(request.headers.get('origin')))?.host !== ownHost) {
    return new Response(null, { status: 403 });
  }

  if (!FORM_CONTENT_TYPE.test(String(request.headers.get('content-type')))) {
    return new Response(null, { status: 400 });
  }

  const documentIds = documentIdsSchema.safeParse(
    (await request.formData()).getAll('documentIds'),
  );

  if (!documentIds.success) {
    return new Response(null, { status: 400 });
  }

  return { documentIds: [...new Set(documentIds.data)] };
}

export function zipEntryPaths({
  documentIds,
  documents,
  folders,
  roots,
}: {
  documentIds: string[];
  documents: ZipDocument[];
  folders: ZipFolder[];
  roots: (string | null)[];
}): ZipEntry[] {
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const entriesPerPath = new Map<string, number>();

  return documentIds.map((documentId) => {
    const document = documents.find(({ id }) => id === documentId)!;
    const path = entryPath([
      ...folderNames(foldersById, roots, document.folder_id),
      document.name,
    ]);
    const copyNumber = (entriesPerPath.get(path) ?? 0) + 1;

    entriesPerPath.set(path, copyNumber);

    return {
      storagePath: document.storage_path,
      path: copyNumber === 1 ? path : withCopyNumber(path, copyNumber),
    };
  });
}

export function zipResponse(
  admin: Client,
  entries: ZipEntry[],
  zipName: string,
): Response {
  const queue = [...entries];
  const zip = new Zip();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      zip.ondata = (error, chunk, final) => {
        if (error) {
          controller.error(error);
          return;
        }

        controller.enqueue(chunk);

        if (final) {
          controller.close();
        }
      };
    },
    async pull() {
      const entry = queue.shift();

      if (!entry) {
        zip.end();
        return;
      }

      const file = new ZipPassThrough(entry.path);
      const blob = await downloadFromDataRoom(admin, entry.storagePath);

      zip.add(file);
      file.push(new Uint8Array(await blob.arrayBuffer()), true);
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${zipName}.zip`)}`,
    },
  });
}

function folderNames(
  folders: Map<string, ZipFolder>,
  roots: (string | null)[],
  folderId: string,
): string[] {
  const folder = folders.get(folderId)!;

  return roots.includes(folder.id)
    ? [folder.name]
    : [...folderNames(folders, roots, folder.parent_id!), folder.name];
}

function entryPath(names: string[]): string {
  return names
    .map((name) => name.replace(/[/\\]/g, '_'))
    .filter((name) => name !== '' && name !== '.' && name !== '..')
    .join('/');
}

function withCopyNumber(path: string, copyNumber: number): string {
  return path.replace(/(\.[^./]+)?$/, ` (${copyNumber})$1`);
}
