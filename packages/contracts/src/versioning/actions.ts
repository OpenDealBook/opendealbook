'use server';

import type { SupabaseClient } from '@supabase/supabase-js';

import { z } from 'zod';

import { appendDealEvent } from '@odb/events';
import { TEAM_READ_ONLY } from '@odb/next';
import { enhanceAction } from '@odb/next/actions';
import { refusableAction } from '@odb/next/actions/refusable-action';
import type { Database } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { convertDocxToPdf } from '../docx-to-pdf';
import { docxText } from '../redline/docx-text';
import {
  CONTRACTS_BUCKET,
  PDF_CONTENT_TYPE,
  contractPdfPath,
  createSupabaseContractStorage,
} from '../storage';
import { APA_NEEDS_COUNSEL, CANNOT_SHARE, contractPartySchema } from '../types';
import { sellerSideContracts, visibleContracts } from './queries';
import {
  addContractVersion,
  announceNewVersion,
  appendContractVersion,
} from './versioning';

type CounselSide = Database['public']['Enums']['counsel_side'];

const NOT_COUNSEL_ON_CONTRACT = 'You cannot add a version to this contract.';
const NOT_DOCX = 'Upload the redline as a Word (.docx) file.';
const MAX_REDLINE_BYTES = 300 * 1024 * 1024;
const TOO_LARGE = 'The redline is larger than the 300 MiB limit.';
const CANNOT_RETRY_PDF = 'You cannot retry the PDF of this version.';
const PDF_FAILED_AGAIN =
  'The PDF conversion failed again. Try again later or upload the Word file again.';

const CONTRACTS_SEEN_BY = {
  buyer: visibleContracts,
  seller: sellerSideContracts,
} as const satisfies Record<CounselSide, unknown>;

const newVersionSchema = z.object({
  contractId: z.string(),
  docxBytes: z.instanceof(Uint8Array),
  party: contractPartySchema,
  changeSummary: z.string().optional(),
});

export const newVersionFromUpload = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();
    await refuseApaVersionWithoutCounsel(client, input.contractId);

    return appendContractVersion(
      input,
      {
        client,
        storage: createSupabaseContractStorage(client),
        authorUserId: user.id,
      },
      'upload',
    );
  },
  { auth: true, schema: newVersionSchema },
);

export const newVersionFromEditorSave = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();
    await refuseApaVersionWithoutCounsel(client, input.contractId);

    return appendContractVersion(
      input,
      {
        client,
        storage: createSupabaseContractStorage(client),
        authorUserId: user.id,
      },
      'editor_save',
    );
  },
  { auth: true, schema: newVersionSchema },
);

// Counsel are not team members, so the lock trigger lets their writes through;
// the lock is checked here instead, and the write goes through the service
// role once counselSideOn has proven who they are.
export const uploadCounselRedline = enhanceAction(
  async (
    input,
    user,
  ): Promise<{ ok: true } | { ok: false; refusal: string }> => {
    const side = await counselSideOn(
      getSupabaseServerClient(),
      input.dealId,
      input.contractId,
    );
    const admin = getSupabaseServerAdminClient();

    const { data: contract } = await admin
      .from('contract')
      .select('account_id')
      .eq('id', input.contractId)
      .single()
      .throwOnError();
    const { data: locked } = await admin
      .rpc('is_account_locked', { target_account_id: contract.account_id })
      .throwOnError();

    if (locked) {
      return { ok: false, refusal: TEAM_READ_ONLY };
    }

    if (await apaLacksCounsel(admin, input.contractId)) {
      return { ok: false, refusal: APA_NEEDS_COUNSEL };
    }

    if (input.docxBytes.byteLength > MAX_REDLINE_BYTES) {
      return { ok: false, refusal: TOO_LARGE };
    }

    if ((await docxText(input.docxBytes)) === null) {
      return { ok: false, refusal: NOT_DOCX };
    }

    const { version } = await addContractVersion(
      {
        contractId: input.contractId,
        docxBytes: input.docxBytes,
        party: side,
        changeSummary: input.changeSummary,
      },
      {
        client: admin,
        storage: createSupabaseContractStorage(admin),
        authorUserId: user.id,
      },
      'upload',
    );

    await announceNewVersion(
      admin,
      input.dealId,
      input.contractId,
      version.id,
      'service',
    );

    return { ok: true };
  },
  {
    auth: true,
    schema: z.object({
      dealId: z.uuid(),
      contractId: z.uuid(),
      docxBytes: z.instanceof(Uint8Array),
      changeSummary: z.string().optional(),
    }),
  },
);

export const retryContractVersionPdf = enhanceAction(
  async (input): Promise<{ ok: true } | { ok: false; refusal: string }> => {
    const client = getSupabaseServerClient();

    if (!(await callerSeesVersion(client, input.contractVersionId))) {
      return { ok: false, refusal: CANNOT_RETRY_PDF };
    }

    const admin = getSupabaseServerAdminClient();
    const { data: version } = await admin
      .from('contract_version')
      .select(
        'account_id, contract_id, version, docx_bucket, docx_path, pdf_path, contract!inner(deal_id)',
      )
      .eq('id', input.contractVersionId)
      .single()
      .throwOnError();

    if (
      !(await mayAddVersion(
        client,
        version.contract.deal_id,
        version.contract_id,
      ))
    ) {
      return { ok: false, refusal: CANNOT_RETRY_PDF };
    }

    const { data: locked } = await admin
      .rpc('is_account_locked', { target_account_id: version.account_id })
      .throwOnError();

    if (locked) {
      return { ok: false, refusal: TEAM_READ_ONLY };
    }

    if (version.pdf_path !== null) {
      return { ok: true };
    }

    const storage = createSupabaseContractStorage(admin);
    const pdf = await convertDocxToPdf(
      await storage.downloadVersion(version.docx_bucket!, version.docx_path!),
    );

    if (!pdf) {
      return { ok: false, refusal: PDF_FAILED_AGAIN };
    }

    const pdfPath = contractPdfPath(
      version.account_id,
      version.contract_id,
      version.version,
    );
    const { error } = await admin.storage
      .from(CONTRACTS_BUCKET)
      .upload(pdfPath, pdf, { contentType: PDF_CONTENT_TYPE, upsert: true });

    if (error) {
      throw error;
    }

    await admin
      .from('contract_version')
      .update({ pdf_path: pdfPath, pdf_bucket: CONTRACTS_BUCKET })
      .eq('id', input.contractVersionId)
      .throwOnError();

    return { ok: true };
  },
  { auth: true, schema: z.object({ contractVersionId: z.uuid() }) },
);

export const adoptContractVersion = refusableAction(
  async (input): Promise<void> => {
    const client = getSupabaseServerClient();
    const { data: adopted } = await client
      .from('contract_version')
      .select('contract_id, version, contract!inner(deal_id)')
      .eq('id', input.contractVersionId)
      .single()
      .throwOnError();

    await appendDealEvent(client, {
      dealId: adopted.contract.deal_id,
      aggregateType: 'contract',
      aggregateId: adopted.contract_id,
      eventType: 'contract.version_set',
      payload: { current_version: adopted.version },
    });
  },
  z.object({ contractVersionId: z.uuid() }),
  {
    what: 'change the current contract version',
    needs: 'deals.manage',
    dealId: async (input) => {
      const { data: version } = await getSupabaseServerClient()
        .from('contract_version')
        .select('contract!inner(deal_id)')
        .eq('id', input.contractVersionId)
        .single()
        .throwOnError();

      return version.contract.deal_id;
    },
  },
);

export const setContractVersionShared = enhanceAction(
  async (input): Promise<{ ok: true } | { ok: false; refusal: string }> => {
    const { data: updated } = await getSupabaseServerClient()
      .from('contract_version')
      .update({ shared_at: input.shared ? new Date().toISOString() : null })
      .eq('id', input.contractVersionId)
      .select('id')
      .throwOnError();

    return updated.length === 0
      ? { ok: false, refusal: CANNOT_SHARE }
      : { ok: true };
  },
  {
    auth: true,
    schema: z.object({ contractVersionId: z.uuid(), shared: z.boolean() }),
  },
);

async function refuseApaVersionWithoutCounsel(
  client: SupabaseClient<Database>,
  contractId: string,
): Promise<void> {
  if (await apaLacksCounsel(client, contractId)) {
    throw new Error(APA_NEEDS_COUNSEL);
  }
}

async function apaLacksCounsel(
  client: SupabaseClient<Database>,
  contractId: string,
): Promise<boolean> {
  const { data: contract } = await client
    .from('contract')
    .select('type, deal_id')
    .eq('id', contractId)
    .single()
    .throwOnError();

  return (
    contract.type === 'apa' && !(await counselReady(client, contract.deal_id))
  );
}

async function counselReady(
  client: SupabaseClient<Database>,
  dealId: string,
): Promise<boolean> {
  const { data: ready } = await client
    .rpc('apa_counsel_ready', { deal_id: dealId })
    .throwOnError();

  return ready;
}

async function callerSeesVersion(
  client: SupabaseClient<Database>,
  contractVersionId: string,
): Promise<boolean> {
  const { data: teamOrBuyerSide } = await client
    .from('contract_version')
    .select('id')
    .eq('id', contractVersionId)
    .maybeSingle()
    .throwOnError();

  if (teamOrBuyerSide) {
    return true;
  }

  const { data: sellerSide } = await client
    .rpc('seller_side_contract_version', {
      contract_version_id: contractVersionId,
    })
    .throwOnError();

  return sellerSide.length > 0;
}

async function mayAddVersion(
  client: SupabaseClient<Database>,
  dealId: string,
  contractId: string,
): Promise<boolean> {
  const { data: manages } = await client
    .rpc('has_deal_permission', { deal_id: dealId, permission: 'deals.manage' })
    .throwOnError();

  return (
    manages || (await counselSideSeeing(client, dealId, contractId)) !== null
  );
}

async function counselSideOn(
  client: SupabaseClient<Database>,
  dealId: string,
  contractId: string,
): Promise<CounselSide> {
  const side = await counselSideSeeing(client, dealId, contractId);

  if (side === null) {
    throw new Error(NOT_COUNSEL_ON_CONTRACT);
  }

  return side;
}

async function counselSideSeeing(
  client: SupabaseClient<Database>,
  dealId: string,
  contractId: string,
): Promise<CounselSide | null> {
  for (const side of ['buyer', 'seller'] as const) {
    const { data: isCounsel } = await client
      .rpc('is_deal_counsel', { deal_id: dealId, side })
      .throwOnError();

    if (
      isCounsel &&
      (await CONTRACTS_SEEN_BY[side](client, dealId)).some(
        (contract) => contract.id === contractId,
      )
    ) {
      return side;
    }
  }

  return null;
}
