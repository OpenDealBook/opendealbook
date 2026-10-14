import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '@odb/supabase';

import { Refusal } from '../actions/refusal';
import { isWithinFolder, packageRoot } from '../uploads/access';
import { dispositionSchema, signedDocumentUrl } from './signed-document-url';
import { signedInUser } from './signed-in-user';

type Client = SupabaseClient<Database>;

const packageRequestSchema = z.object({
  dealId: z.uuid(),
  documentId: z.uuid(),
  disposition: dispositionSchema,
});

async function managedPackageDocument(
  client: Client,
  accountSlug: string,
  dealId: string,
  documentId: string,
) {
  const root = await packageRoot(dealId).catch((error: unknown) => {
    if (error instanceof Refusal) {
      return null;
    }

    throw error;
  });

  if (!root) {
    return null;
  }

  const [{ data: account }, { data: document }] = await Promise.all([
    client
      .from('accounts')
      .select('slug')
      .eq('id', root.accountId)
      .single()
      .throwOnError(),
    client
      .from('dr_document')
      .select('name, deal_id, folder_id, storage_path')
      .eq('id', documentId)
      .eq('deal_id', dealId)
      .maybeSingle()
      .throwOnError(),
  ]);

  if (account.slug !== accountSlug || !document) {
    return null;
  }

  return (await isWithinFolder(dealId, document.folder_id, root.masterFolderId))
    ? document
    : null;
}

interface PackageDocumentRequestInput {
  client: Client;
  admin: Client;
  request: Request;
  accountSlug: string;
  dealId: string;
  documentId: string;
}

export async function respondToPackageDocumentRequest({
  client,
  admin,
  request,
  accountSlug,
  dealId,
  documentId,
}: PackageDocumentRequestInput): Promise<Response> {
  const parsed = packageRequestSchema.safeParse({
    dealId,
    documentId,
    disposition: new URL(request.url).searchParams.get('disposition'),
  });

  if (!parsed.success) {
    return new Response(null, { status: 400 });
  }

  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return new Response(null, { status: 403 });
  }

  if (!(await signedInUser(client))) {
    return Response.redirect(new URL('/auth/sign-in', request.url), 307);
  }

  const document = await managedPackageDocument(
    client,
    accountSlug,
    parsed.data.dealId,
    parsed.data.documentId,
  );
  const url =
    document &&
    (await signedDocumentUrl(admin, document, parsed.data.disposition));

  if (!url) {
    return new Response(null, { status: 404 });
  }

  return Response.redirect(url, 307);
}
