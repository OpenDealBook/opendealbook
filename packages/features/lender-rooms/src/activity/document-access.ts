import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '@odb/supabase';

import { recordActivity } from './record-activity';
import { dispositionSchema, signedDocumentUrl } from './signed-document-url';
import { signedInUser } from './signed-in-user';

type Client = SupabaseClient<Database>;

const documentRequestSchema = z.object({
  roomId: z.uuid(),
  documentId: z.uuid(),
  disposition: dispositionSchema,
});

interface DocumentAccessInput {
  client: Client;
  admin: Client;
  roomId: string;
  documentId: string;
  disposition: 'preview' | 'download';
}

async function recordDocumentAccess({
  client,
  admin,
  roomId,
  documentId,
  disposition,
}: DocumentAccessInput): Promise<string | null> {
  const { data: shown } = await client
    .rpc('lender_room_shows_document', {
      room_id: roomId,
      document_id: documentId,
    })
    .throwOnError();

  if (!shown) {
    return null;
  }

  const { data: document } = await admin
    .from('dr_document')
    .select('name, deal_id, storage_path')
    .eq('id', documentId)
    .single()
    .throwOnError();

  const url = await signedDocumentUrl(admin, document, disposition);

  if (!url) {
    return null;
  }

  await recordActivity({
    client,
    admin,
    roomId,
    documentId,
    action:
      disposition === 'preview' ? 'document_previewed' : 'document_downloaded',
  });

  return url;
}

interface DocumentRequestInput {
  client: Client;
  admin: Client;
  request: Request;
  roomId: string;
  documentId: string;
}

export async function respondToDocumentRequest({
  client,
  admin,
  request,
  roomId,
  documentId,
}: DocumentRequestInput): Promise<Response> {
  const parsed = documentRequestSchema.safeParse({
    roomId,
    documentId,
    disposition: new URL(request.url).searchParams.get('disposition'),
  });

  if (!parsed.success) {
    return new Response(null, { status: 400 });
  }

  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return Response.redirect(new URL(`/lender/${roomId}`, request.url), 307);
  }

  if (!(await signedInUser(client))) {
    const signIn = new URL('/lender/sign-in', request.url);

    signIn.searchParams.set('next', `/lender/${roomId}`);

    return Response.redirect(signIn, 307);
  }

  const url = await recordDocumentAccess({ client, admin, ...parsed.data });

  if (!url) {
    return new Response(null, { status: 404 });
  }

  return Response.redirect(url, 307);
}
