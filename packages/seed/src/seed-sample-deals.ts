import { DATA_ROOM_BUCKET } from '@odb/data-room/storage';
import { appendDealEvent } from '@odb/events';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

export const SAMPLE_DEALS_NOT_LOADED =
  "Example deals couldn't be loaded. Reload them from Settings.";

export class SampleDealsNotLoaded extends Error {
  constructor() {
    super(SAMPLE_DEALS_NOT_LOADED);
  }
}

const SAMPLE_DOCUMENT = new TextEncoder().encode(
  '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n',
);

type SeedInput = {
  accountId: string;
  userId: string;
};

type SeededDocument = {
  deal_id: string;
  document_id: string;
  storage_path: string;
  removed_paths: string[];
};

async function seed(
  { accountId, userId }: SeedInput,
  onlyOnce: boolean,
): Promise<void> {
  const client = getSupabaseServerAdminClient();

  const { data } = await client
    .rpc('seed_sample_deals', {
      p_account_id: accountId,
      p_user_id: userId,
      p_only_once: onlyOnce,
    })
    .throwOnError();

  if (data === null) {
    return;
  }

  const seeded = data as SeededDocument;
  const bucket = client.storage.from(DATA_ROOM_BUCKET);
  const { error } = await bucket.upload(seeded.storage_path, SAMPLE_DOCUMENT, {
    contentType: 'application/pdf',
  });

  if (error) {
    await appendDealEvent(client, {
      dealId: seeded.deal_id,
      aggregateType: 'dr_document',
      aggregateId: seeded.document_id,
      eventType: 'dr_document.removed',
      actorKind: 'service',
      payload: {},
    });
    throw new SampleDealsNotLoaded();
  }

  if (seeded.removed_paths.length > 0) {
    const removed = await bucket.remove(seeded.removed_paths);

    if (removed.error) {
      throw new SampleDealsNotLoaded();
    }
  }
}

export function seedSampleDealsOnce(input: SeedInput): Promise<void> {
  return seed(input, true);
}

export function seedSampleDeals(input: SeedInput): Promise<void> {
  return seed(input, false);
}
