import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import type { Database } from '@odb/supabase';

import { recordActivity } from './record-activity';
import { dispositionSchema, signedDocumentUrl } from './signed-document-url';
import { signedInUser } from './signed-in-user';

type Client = SupabaseClient<Database>;

const faqFileRequestSchema = z.object({
  roomId: z.uuid(),
  fileId: z.uuid(),
  disposition: dispositionSchema,
});

// A rename changes only the display name, so the stored key's extension
// decides the preview rendition and stays on the downloaded file.
function nameWithStoredExtension(file: {
  name: string;
  storage_path: string;
}): string {
  const extension = /\.[^./]+$/.exec(file.storage_path)?.[0] ?? '';

  return file.name.toLowerCase().endsWith(extension.toLowerCase())
    ? file.name
    : `${file.name}${extension}`;
}

interface FaqFileAccessInput {
  client: Client;
  admin: Client;
  roomId: string;
  fileId: string;
  disposition: z.infer<typeof dispositionSchema>;
}

async function recordFaqFileAccess({
  client,
  admin,
  roomId,
  fileId,
  disposition,
}: FaqFileAccessInput): Promise<string | null> {
  const { data: shown } = await client
    .rpc('lender_room_shows_faq_file', { room_id: roomId, file_id: fileId })
    .throwOnError();

  if (!shown) {
    return null;
  }

  const { data: file } = await admin
    .from('lender_faq_file')
    .select('entry_id, name, deal_id, storage_path')
    .eq('id', fileId)
    .single()
    .throwOnError();

  const url = await signedDocumentUrl(
    admin,
    { ...file, name: nameWithStoredExtension(file) },
    disposition,
  );

  if (!url) {
    return null;
  }

  await recordActivity({
    client,
    admin,
    roomId,
    faqEntryId: file.entry_id,
    faqFileId: fileId,
    action:
      disposition === 'preview' ? 'faq_file_previewed' : 'faq_file_downloaded',
  });

  return url;
}

interface FaqFileRequestInput {
  client: Client;
  admin: Client;
  request: Request;
  roomId: string;
  fileId: string;
}

export async function respondToFaqFileRequest({
  client,
  admin,
  request,
  roomId,
  fileId,
}: FaqFileRequestInput): Promise<Response> {
  const parsed = faqFileRequestSchema.safeParse({
    roomId,
    fileId,
    disposition: new URL(request.url).searchParams.get('disposition'),
  });

  if (!parsed.success) {
    return new Response(null, { status: 400 });
  }

  const faqPath = `/lender/${roomId}/faq`;

  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return Response.redirect(new URL(faqPath, request.url), 307);
  }

  if (!(await signedInUser(client))) {
    const signIn = new URL('/lender/sign-in', request.url);

    signIn.searchParams.set('next', faqPath);

    return Response.redirect(signIn, 307);
  }

  const url = await recordFaqFileAccess({ client, admin, ...parsed.data });

  if (!url) {
    return new Response(null, { status: 404 });
  }

  return Response.redirect(url, 307);
}
