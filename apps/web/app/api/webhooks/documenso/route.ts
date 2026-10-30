import {
  createDocumensoClient,
  handleContractSignatureEvent,
  isDocumensoConfigured,
  signatureEventDocumentId,
} from '@odb/contracts/esign';
import { setUpLoiSigned } from '@odb/deal-timeline/loi-signed-setup.ts';
import { handleFormSignatureEvent } from '@odb/lender-rooms/esign/webhook.ts';
import { enhanceRouteHandler } from '@odb/next/routes';
import { getLogger } from '@odb/shared/logger';
import { getSupabaseServerAdminClient } from '@odb/supabase/server';

import { createHash, timingSafeEqual } from 'node:crypto';

const MIN_SECRET_LENGTH = 32;

let hasWarnedSecretIsUnusable = false;
let hasWarnedDocumensoIsNotConfigured = false;

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function carriesWebhookSecret(request: Request): boolean {
  const secret = process.env.DOCUMENSO_WEBHOOK_SECRET ?? '';

  if (secret.length < MIN_SECRET_LENGTH) {
    if (!hasWarnedSecretIsUnusable) {
      hasWarnedSecretIsUnusable = true;
      getLogger().warn(
        `DOCUMENSO_WEBHOOK_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters; refusing every Documenso webhook`,
      );
    }

    return false;
  }

  // Hashing first gives timingSafeEqual the equal lengths it requires, so
  // neither the secret's length nor its content shows in the response time.
  return timingSafeEqual(
    sha256(request.headers.get('X-Documenso-Secret') ?? ''),
    sha256(secret),
  );
}

export const POST = enhanceRouteHandler(
  async ({ request }) => {
    if (!carriesWebhookSecret(request)) {
      return new Response('Unauthorized', { status: 401 });
    }

    if (!isDocumensoConfigured()) {
      if (!hasWarnedDocumensoIsNotConfigured) {
        hasWarnedDocumensoIsNotConfigured = true;
        getLogger().warn(
          'Documenso is not configured; acknowledging its webhooks without acting on them',
        );
      }

      return new Response('OK', { status: 200 });
    }

    let documentId: string | null;

    try {
      documentId = signatureEventDocumentId(await request.json());
    } catch {
      return new Response('Bad Request', { status: 400 });
    }

    if (documentId === null) {
      return new Response('OK', { status: 200 });
    }

    try {
      const admin = getSupabaseServerAdminClient();
      const documenso = createDocumensoClient();

      const isLenderForm = await handleFormSignatureEvent(documentId, {
        admin,
        documenso,
      });

      if (!isLenderForm) {
        await handleContractSignatureEvent(documentId, {
          client: admin,
          admin,
          documenso,
          onLoiSigned: (loi) =>
            setUpLoiSigned(admin, loi, {
              actor: { actorKind: 'service', actorVia: 'documenso' },
            }),
        });
      }
    } catch (error) {
      getLogger().error({ error }, 'Documenso webhook could not be handled');

      return new Response('Internal Server Error', { status: 500 });
    }

    return new Response('OK', { status: 200 });
  },
  { auth: false },
);
