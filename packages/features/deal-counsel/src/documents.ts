import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import {
  dispositionSchema,
  signedDocumentUrl,
} from '@odb/lender-rooms/activity/signed-document-url.ts';
import { signedInUser } from '@odb/lender-rooms/activity/signed-in-user.ts';
import type { Database } from '@odb/supabase';

import { counselPortalPath, counselSignInPath } from './entry-rules';

type Client = SupabaseClient<Database>;

const requestSchema = z.object({
  dealId: z.uuid(),
  documentId: z.uuid(),
  disposition: dispositionSchema,
});

export async function respondToBuyerCounselDocumentRequest({
  client,
  admin,
  request,
  dealId,
  documentId,
}: {
  client: Client;
  admin: Client;
  request: Request;
  dealId: string;
  documentId: string;
}): Promise<Response> {
  const parsed = requestSchema.safeParse({
    dealId,
    documentId,
    disposition: new URL(request.url).searchParams.get('disposition'),
  });

  if (!parsed.success) {
    return new Response(null, { status: 400 });
  }

  const dataRoom = `${counselPortalPath(dealId)}/data-room`;

  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return Response.redirect(new URL(dataRoom, request.url), 307);
  }

  const user = await signedInUser(client);

  if (!user) {
    return Response.redirect(
      new URL(counselSignInPath(dataRoom), request.url),
      307,
    );
  }

  const { data: document } = await client
    .rpc('buyer_counsel_documents', { deal_id: dealId })
    .eq('id', documentId)
    .maybeSingle()
    .throwOnError();

  if (!document) {
    return new Response(null, { status: 404 });
  }

  const url = await signedDocumentUrl(admin, document, parsed.data.disposition);

  if (!url) {
    return new Response(null, { status: 404 });
  }

  await admin
    .from('counsel_activity')
    .insert({
      account_id: document.account_id,
      deal_id: dealId,
      user_id: user.id,
      action:
        parsed.data.disposition === 'preview'
          ? 'document_previewed'
          : 'document_downloaded',
      dr_document_id: documentId,
    })
    .throwOnError();

  return Response.redirect(url, 307);
}

// The Seller's counsel folder is the seller side's alone, so opening a file
// there is never recorded where the team reads activity.
export async function respondToSellerCounselFolderDocumentRequest({
  client,
  admin,
  request,
  dealId,
  documentId,
}: {
  client: Client;
  admin: Client;
  request: Request;
  dealId: string;
  documentId: string;
}): Promise<Response> {
  const parsed = requestSchema.safeParse({
    dealId,
    documentId,
    disposition: new URL(request.url).searchParams.get('disposition'),
  });

  if (!parsed.success) {
    return new Response(null, { status: 400 });
  }

  const sellerRoom = `${counselPortalPath(dealId)}/seller-room`;

  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return Response.redirect(new URL(sellerRoom, request.url), 307);
  }

  if (!(await signedInUser(client))) {
    return Response.redirect(
      new URL(counselSignInPath(sellerRoom), request.url),
      307,
    );
  }

  const [{ data: document }, { data: sellerCounselFolders }] =
    await Promise.all([
      client
        .from('dr_document')
        .select('name, deal_id, folder_id, storage_path')
        .eq('id', documentId)
        .eq('deal_id', dealId)
        .maybeSingle()
        .throwOnError(),
      client.rpc('seller_counsel_folder_ids').throwOnError(),
    ]);

  if (!document || !sellerCounselFolders.includes(document.folder_id)) {
    return new Response(null, { status: 404 });
  }

  const url = await signedDocumentUrl(admin, document, parsed.data.disposition);

  if (!url) {
    return new Response(null, { status: 404 });
  }

  return Response.redirect(url, 307);
}

export interface CounselActivityEntry {
  id: string;
  action: Database['public']['Enums']['counsel_activity_action'];
  person: string;
  file: string;
  at: string;
}

// Files are named with the service role so a file removed since is still
// named in the history.
export async function loadCounselActivity(
  client: Client,
  admin: Client,
  dealId: string,
): Promise<CounselActivityEntry[]> {
  const [{ data: activity }, { data: counsel }, { data: removed }] =
    await Promise.all([
      client
        .from('counsel_activity')
        .select('id, action, user_id, dr_document_id, created_at')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false })
        .throwOnError(),
      client
        .from('deal_counsel')
        .select('user_id, name, email')
        .eq('deal_id', dealId)
        .throwOnError(),
      client
        .from('deal_counsel_removed')
        .select('user_id, email')
        .eq('deal_id', dealId)
        .throwOnError(),
    ]);

  const { data: documents } = await admin
    .from('dr_document')
    .select('id, name')
    .in('id', [...new Set(activity.map((row) => row.dr_document_id))])
    .throwOnError();

  const personOf = new Map([
    ...removed.map((row) => [row.user_id, row.email] as const),
    ...counsel.map((row) => [row.user_id, row.name ?? row.email] as const),
  ]);
  const fileOf = new Map(documents.map((row) => [row.id, row.name]));

  return activity.map((row) => ({
    id: row.id,
    action: row.action,
    person: personOf.get(row.user_id)!,
    file: fileOf.get(row.dr_document_id)!,
    at: row.created_at,
  }));
}
