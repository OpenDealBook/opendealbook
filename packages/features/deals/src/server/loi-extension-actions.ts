'use server';

import type { SupabaseClient, User } from '@supabase/supabase-js';

import { z } from 'zod';

import { recordExtensionAgreed } from '@odb/contracts/esign';
import {
  type DealEventInput,
  appendDealEvent,
  appendDealEvents,
} from '@odb/events';
import { plainDate } from '@odb/shared/utils';
import type { Database } from '@odb/supabase';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { dealOfferFieldInput } from './contract-field-values';
import { generationRefusal } from './contract-signature-loader';
import {
  generateContract,
  loiExtensionTo,
  nextExtensionVersionOrRefuse,
} from './generate-contract';
import { Refusal, refusableAction } from './refusal';
import { recordSignedCopy, signedCopySchema } from './signed-copy';

const CHECK_VIOLATION = '23514';

const BROKEN_RULES: [RegExp, (date: string) => string][] = [
  [
    /must extend the current signed LOI/,
    () => "Only the deal's current signed LOI can be extended",
  ],
  [
    /must end exclusivity after (\S+)/,
    (after) => `The new exclusivity end must be after ${plainDate(after)}`,
  ],
  [
    /cannot be noted as agreed after today/,
    () => 'The day the extension was agreed cannot be in the future',
  ],
  [
    /cannot be noted as agreed before the LOI was signed on (\S+)/,
    (signedOn) =>
      `The day the extension was agreed cannot be before the LOI was signed on ${plainDate(signedOn)}`,
  ],
  [
    /needs its text and the day it was agreed/,
    () => 'Say how the extension was agreed',
  ],
  [
    /has a signed copy and cannot be noted/,
    () => 'This extension has a signed copy, so it cannot be noted',
  ],
  [
    /is signed or noted, so its date is fixed/,
    () =>
      'This extension is signed or noted, so its end date can no longer change',
  ],
];

async function refuseBrokenRule<Value>(
  run: () => Promise<Value>,
): Promise<Value> {
  try {
    return await run();
  } catch (failure) {
    const { code, message } = failure as { code?: string; message: string };

    for (const [rule, reason] of BROKEN_RULES) {
      const broken = code === CHECK_VIOLATION && rule.exec(message);

      if (broken) {
        throw new Refusal(reason(broken[1]!));
      }
    }

    throw failure;
  }
}

function managersOnly(what: string) {
  return {
    what,
    needs: 'deals.manage' as const,
    dealId: (input: { deal_id: string }) => input.deal_id,
  };
}

const newExtension = {
  deal_id: z.uuid(),
  loi_id: z.uuid(),
  extends_to: z.iso.date(),
};

const existingExtension = {
  deal_id: z.uuid(),
  extension_id: z.uuid(),
};

const agreement = {
  note: z.string(),
  noted_on: z.iso.date(),
};

const INSUFFICIENT_PRIVILEGE = '42501';

async function refuseUnlessDealManager(
  client: SupabaseClient<Database>,
  dealId: string,
): Promise<void> {
  const { data: manager } = await client
    .rpc('has_deal_permission', { deal_id: dealId, permission: 'deals.manage' })
    .throwOnError();

  if (!manager) {
    throw Object.assign(
      new Error(`not authorized on deal ${dealId}: needs deals.manage`),
      { code: INSUFFICIENT_PRIVILEGE },
    );
  }
}

async function refuseWhileSigning(
  client: SupabaseClient<Database>,
  extensionId: string,
): Promise<void> {
  const { data: signing } = await client
    .from('contract_version')
    .select('signing_status')
    .eq('contract_id', extensionId)
    .in('signing_status', ['draft', 'sent'])
    .throwOnError();

  if (signing.length > 0) {
    throw new Refusal(generationRefusal('loi_extension', 'sent')!);
  }
}

async function extensionTo(
  client: SupabaseClient<Database>,
  input: z.infer<z.ZodObject<typeof newExtension>>,
): Promise<{ extensionId: string; creation: DealEventInput[] }> {
  const { id, existing } = await loiExtensionTo(
    client,
    input.loi_id,
    input.extends_to,
  );

  return {
    extensionId: id,
    creation: existing
      ? []
      : [
          {
            aggregateType: 'contract',
            aggregateId: id,
            eventType: 'contract.created',
            expectedAggregateSeq: 0,
            payload: {
              type: 'loi_extension',
              status: 'draft',
              current_version: 0,
              parent_contract_id: input.loi_id,
              extends_to: input.extends_to,
            },
          },
        ],
  };
}

function noted(
  extensionId: string,
  agreed: { note: string; noted_on: string },
): DealEventInput {
  return {
    aggregateType: 'contract',
    aggregateId: extensionId,
    eventType: 'contract.extension_noted',
    payload: { note: agreed.note, noted_on: agreed.noted_on },
  };
}

async function draftFromTemplate(
  client: SupabaseClient<Database>,
  user: User,
  input: z.infer<z.ZodObject<typeof newExtension>>,
) {
  const slot = await nextExtensionVersionOrRefuse({
    client,
    loiId: input.loi_id,
    extendsTo: input.extends_to,
  });
  const { data: deal } = await client
    .from('deal')
    .select('account_id')
    .eq('id', input.deal_id)
    .single()
    .throwOnError();
  const offer = await dealOfferFieldInput(
    client,
    input.deal_id,
    deal.account_id,
  );

  return generateContract({
    client,
    user,
    dealId: input.deal_id,
    accountId: deal.account_id,
    offerVersionId: offer.offerVersionId,
    terms: offer.terms,
    slot,
    type: 'loi_extension',
    parentContractId: input.loi_id,
    extendsTo: input.extends_to,
  });
}

export const createLoiExtensionFromTemplate = refusableAction(
  (data, user) =>
    refuseBrokenRule(() =>
      draftFromTemplate(getSupabaseServerClient(), user, data),
    ),
  z.object(newExtension),
  managersOnly('extend LOIs'),
);

export const createNotedLoiExtension = refusableAction(
  (data) =>
    refuseBrokenRule(async () => {
      const client = getSupabaseServerClient();
      const { extensionId, creation } = await extensionTo(client, data);

      await refuseWhileSigning(client, extensionId);
      await appendDealEvents(client, data.deal_id, [
        ...creation,
        noted(extensionId, data),
      ]);
      await recordExtensionAgreed(
        client,
        data.deal_id,
        extensionId,
        data.noted_on,
      );
    }),
  z.object({ ...newExtension, ...agreement }),
  managersOnly('note LOI extensions'),
);

export const noteLoiExtension = refusableAction(
  (data) =>
    refuseBrokenRule(async () => {
      const client = getSupabaseServerClient();

      await refuseWhileSigning(client, data.extension_id);
      await appendDealEvents(client, data.deal_id, [
        noted(data.extension_id, data),
      ]);
      await recordExtensionAgreed(
        client,
        data.deal_id,
        data.extension_id,
        data.noted_on,
      );
    }),
  z.object({ ...existingExtension, ...agreement }),
  managersOnly('note LOI extensions'),
);

export const rescheduleLoiExtension = refusableAction(
  (data, user) =>
    refuseBrokenRule(async () => {
      const client = getSupabaseServerClient();
      const { data: extension } = await client
        .from('contract')
        .select('parent_contract_id, versions:contract_version(id)')
        .eq('id', data.extension_id)
        .single()
        .throwOnError();
      const loiId = extension.parent_contract_id!;
      const { existing } = await loiExtensionTo(client, loiId, data.extends_to);

      if (existing && existing.id !== data.extension_id) {
        throw new Refusal(
          `This LOI already has an extension to ${plainDate(data.extends_to)}`,
        );
      }

      await refuseWhileSigning(client, data.extension_id);
      await appendDealEvent(client, {
        dealId: data.deal_id,
        aggregateType: 'contract',
        aggregateId: data.extension_id,
        eventType: 'contract.extension_rescheduled',
        payload: { extends_to: data.extends_to },
      });

      if (extension.versions.length > 0) {
        await draftFromTemplate(client, user, {
          deal_id: data.deal_id,
          loi_id: loiId,
          extends_to: data.extends_to,
        });
      }
    }),
  z.object({ ...existingExtension, extends_to: z.iso.date() }),
  managersOnly('change the end date of LOI extensions'),
);

export const recordLoiExtensionSignedElsewhere = refusableAction(
  (data, user) =>
    refuseBrokenRule(async () => {
      const client = getSupabaseServerClient();

      await refuseUnlessDealManager(client, data.deal_id);
      const { extensionId, creation } = await extensionTo(client, data);
      await appendDealEvents(client, data.deal_id, creation);

      return recordSignedCopy(
        {
          dealId: data.deal_id,
          type: 'loi_extension',
          contractId: extensionId,
          party: data.party,
          signedOn: data.signed_on,
          file: data.file,
        },
        user.id,
      );
    }),
  signedCopySchema.extend(newExtension),
  managersOnly('record signed LOI extensions'),
);

export const recordSignedCopyOfLoiExtension = refusableAction(
  (data, user) =>
    refuseBrokenRule(async () => {
      await refuseUnlessDealManager(getSupabaseServerClient(), data.deal_id);

      return recordSignedCopy(
        {
          dealId: data.deal_id,
          type: 'loi_extension',
          contractId: data.extension_id,
          party: data.party,
          signedOn: data.signed_on,
          file: data.file,
        },
        user.id,
      );
    }),
  signedCopySchema.extend(existingExtension),
  managersOnly('record signed LOI extensions'),
);
