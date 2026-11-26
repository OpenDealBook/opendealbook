import { getLogger } from '@odb/shared/logger';

function sseFrame(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

export function eventStream(
  run: (send: (event: string, data: unknown) => void) => Promise<void>,
  onCrash: () => Promise<void>,
  context: Record<string, string>,
): Response {
  let open = true;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (open) {
          controller.enqueue(sseFrame(event, data));
        }
      };
      void run(send)
        .catch(async (error: unknown) => {
          getLogger().error(
            { error, ...context },
            'An AI event stream crashed',
          );
          send('error', {
            error: 'Something went wrong',
            code: 'stream_failed',
          });
          await onCrash().catch((markError: unknown) => {
            getLogger().error(
              { error: markError, ...context },
              'A crashed AI event stream could not be marked failed',
            );
          });
        })
        .finally(() => {
          if (open) {
            controller.close();
          }
        });
    },
    cancel() {
      open = false;
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
    },
  });
}
