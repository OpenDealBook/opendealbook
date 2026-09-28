const POLL_INTERVAL_MS = 2000;

export interface DoclingConfig {
  baseUrl: string;
  apiKey: string;
}

export async function extractMarkdown(
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
