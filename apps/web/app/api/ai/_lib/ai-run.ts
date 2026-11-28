import type { FinishOutcome } from '@odb/ai/server';
import type { getSupabaseServerClient } from '@odb/supabase/server';
import { ingestibleFormat } from '@odb/workflows/team-ai';

const ESCAPED_NUL = /(?<=(?:^|[^\\])(?:\\\\)*)\\u0000/g;
const PROCESSING_WINDOW_MS = 15 * 60_000;

export const ATTACHMENTS_PROCESSING =
  'An attached file is still being processed; try again shortly';

export function withoutNul<T>(value: T): T {
  return JSON.parse(JSON.stringify(value).replace(ESCAPED_NUL, '')) as T;
}

export async function readableAttachments<
  D extends {
    id: string;
    name: string;
    version: number;
    created_at: string | null;
  },
>(
  client: ReturnType<typeof getSupabaseServerClient>,
  documents: D[],
): Promise<D[] | 'processing'> {
  const ingestible = await Promise.all(
    documents
      .filter((document) => ingestibleFormat(document.name))
      .map(async (document) => {
        const { data: segments } = await client
          .from('document_segment')
          .select('dr_document_id')
          .eq('dr_document_id', document.id)
          .eq('document_version', document.version)
          .limit(1)
          .throwOnError();
        return { document, hasText: segments.length > 0 };
      }),
  );
  const processingSince = Date.now() - PROCESSING_WINDOW_MS;
  return ingestible.some(
    ({ document, hasText }) =>
      !hasText && Date.parse(document.created_at!) > processingSince,
  )
    ? 'processing'
    : ingestible
        .filter(({ hasText }) => hasText)
        .map(({ document }) => document);
}

export function startRefusal<R extends { sqlState: string; marker: string }>(
  error: { code: string; message: string },
  refusals: readonly R[],
): R {
  const refusal = refusals.find(
    ({ sqlState, marker }) =>
      error.code === sqlState && error.message.includes(marker),
  );
  if (!refusal) {
    throw error;
  }
  return refusal;
}

export function unfinishedColumns(
  outcome: Exclude<FinishOutcome<unknown>, { status: 'finished' }>,
) {
  switch (outcome.status) {
    case 'credits_ran_out':
      return { status: 'credits_ran_out' as const };
    case 'ran_out':
      return { status: 'failed' as const, failure_reason: 'too_long' as const };
    case 'no_submit':
      return {
        status: 'failed' as const,
        failure_reason: 'no_submit' as const,
      };
    case 'failed':
      return { status: 'failed' as const, failure_reason: 'failed' as const };
  }
}
