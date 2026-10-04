import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@odb/supabase';

import { callStructuredChat, resolveLlmEndpoint } from './structured';

type Client = SupabaseClient<Database>;

const POLL_INTERVAL_MS = 2000;

const EXTRACTION_SYSTEM_PROMPT =
  'You extract structured data from a financial document. ' +
  'Reply with strict JSON matching the requested shape, using null for any figure the document does not contain.';

interface DoclingConfig {
  baseUrl: string;
  apiKey: string;
}

function resolveDoclingConfig(): DoclingConfig | null {
  const baseUrl = process.env.DOCLING_URL;
  const apiKey = process.env.DOCLING_API_KEY;

  if (!baseUrl || !apiKey) {
    return null;
  }

  return { baseUrl, apiKey };
}

async function convertToMarkdown(
  config: DoclingConfig,
  sourceUrl: string,
): Promise<string> {
  const headers = {
    'content-type': 'application/json',
    'x-api-key': config.apiKey,
  };

  const enqueued = await fetch(`${config.baseUrl}/v1/convert/source/async`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      http_sources: [{ url: sourceUrl }],
      options: { to_formats: ['md'] },
    }),
  });
  const { task_id: taskId } = (await enqueued.json()) as { task_id: string };

  for (;;) {
    const poll = await fetch(`${config.baseUrl}/v1/status/poll/${taskId}`, {
      headers,
    });
    const { task_status: status } = (await poll.json()) as {
      task_status: string;
    };

    if (status === 'success') {
      break;
    }

    if (status === 'failure') {
      throw new Error(`docling conversion ${taskId} failed`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  const result = await fetch(`${config.baseUrl}/v1/result/${taskId}`, {
    headers,
  });
  const { document } = (await result.json()) as {
    document: { md_content: string };
  };

  return document.md_content;
}

export interface DocumentExtractionInput<T> {
  accountId: string;
  sourceUrl: string;
  instruction: string;
  parse: (raw: unknown) => T;
}

export type DocumentExtractionResult<T> =
  | { status: 'extracted'; value: T }
  | { status: 'unavailable'; reason: string };

export async function extractStructuredFromDocument<T>(
  client: Client,
  { accountId, sourceUrl, instruction, parse }: DocumentExtractionInput<T>,
): Promise<DocumentExtractionResult<T>> {
  const docling = resolveDoclingConfig();

  if (!docling) {
    const reason =
      'docling endpoint is not configured (DOCLING_URL / DOCLING_API_KEY)';
    console.warn(`[ai] document extraction unavailable: ${reason}`);
    return { status: 'unavailable', reason };
  }

  const endpoint = await resolveLlmEndpoint(client, accountId);

  if (!endpoint) {
    const reason = `no llm_endpoint configured for account ${accountId}`;
    console.warn(`[ai] document extraction unavailable: ${reason}`);
    return { status: 'unavailable', reason };
  }

  const markdown = await convertToMarkdown(docling, sourceUrl);
  const content = await callStructuredChat(
    endpoint,
    EXTRACTION_SYSTEM_PROMPT,
    `${instruction}\n\nDocument:\n\n${markdown}`,
  );

  return { status: 'extracted', value: parse(JSON.parse(content)) };
}
