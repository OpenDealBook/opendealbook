const POLL_INTERVAL_MS = 2000;

export interface DoclingConfig {
  baseUrl: string;
  apiKey: string;
}

export function doclingConfigFromEnv(): DoclingConfig | null {
  const baseUrl = process.env.DOCLING_URL;
  const apiKey = process.env.DOCLING_API_KEY;

  if (!baseUrl || !apiKey) {
    return null;
  }

  return { baseUrl, apiKey };
}

export type DoclingPass =
  | { ocr: 'none' }
  | { ocr: 'force'; pages?: readonly [from: number, to: number] };

export async function extractMarkdown(
  config: DoclingConfig,
  sourceUrl: string,
): Promise<string> {
  const { document } = await runTask<{ md_content: string }>(
    config,
    fetch(`${config.baseUrl}/v1/convert/source/async`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.apiKey,
      },
      body: JSON.stringify({
        http_sources: [{ url: sourceUrl }],
        options: { to_formats: ['md'] },
      }),
    }),
  );

  return document.md_content;
}

export async function convertFile(
  config: DoclingConfig,
  bytes: Uint8Array,
  fileName: string,
  pass: DoclingPass,
): Promise<DoclingDocument> {
  const form = new FormData();
  form.append('files', new Blob([Uint8Array.from(bytes)]), fileName);
  form.append('to_formats', 'json');
  form.append('do_ocr', String(pass.ocr === 'force'));
  form.append('force_ocr', String(pass.ocr === 'force'));
  if (pass.ocr === 'force' && pass.pages) {
    form.append('page_range', String(pass.pages[0]));
    form.append('page_range', String(pass.pages[1]));
  }

  const { document } = await runTask<{ json_content: DoclingDocument }>(
    config,
    fetch(`${config.baseUrl}/v1/convert/file/async`, {
      method: 'POST',
      headers: { 'x-api-key': config.apiKey },
      body: form,
    }),
  );

  return document.json_content;
}

async function runTask<Document>(
  config: DoclingConfig,
  enqueue: Promise<Response>,
): Promise<{ document: Document }> {
  const headers = { 'x-api-key': config.apiKey };
  const { task_id: taskId } = (await (await enqueue).json()) as {
    task_id: string;
  };

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

  return (await result.json()) as { document: Document };
}

export interface DoclingRef {
  $ref: string;
}

export interface DoclingNode {
  self_ref: string;
  label: string;
  children: DoclingRef[];
  prov?: { page_no: number }[];
  text?: string;
  level?: number;
  data?: { grid: { text: string; column_header: boolean }[][] };
}

export interface DoclingDocument {
  body: DoclingNode;
  groups: DoclingNode[];
  texts: DoclingNode[];
  tables: DoclingNode[];
  pictures: DoclingNode[];
  pages: Record<string, { page_no: number }>;
}
