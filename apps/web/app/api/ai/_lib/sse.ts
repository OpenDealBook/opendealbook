function sseFrame(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

export function eventStream(
  run: (send: (event: string, data: unknown) => void) => Promise<void>,
): Response {
  let open = true;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void run((event, data) => {
        if (open) {
          controller.enqueue(sseFrame(event, data));
        }
      }).then(() => {
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
