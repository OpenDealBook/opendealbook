import {
  DOCUMENSO_URL,
  GOTENBERG_URL,
  MAILPIT_SMTP_PORT,
  MAILPIT_URL,
  NOVU_API_URL,
  SUPABASE_URL,
  TEMPORAL_TASK_QUEUE,
  TEMPORAL_UI_URL,
  serviceHeaders,
} from '../fixtures/stack';

import { connect } from 'node:net';

type Probe = () => Promise<boolean>;

function responds(
  url: string,
  accept: (response: Response) => Promise<boolean>,
): Probe {
  return () =>
    fetch(url, {
      headers: serviceHeaders,
      signal: AbortSignal.timeout(5000),
    }).then(accept, () => false);
}

const ok = async (response: Response) => response.ok;

export function listens(port: number): Probe {
  return () =>
    new Promise((resolve) => {
      const socket = connect(port, '127.0.0.1');
      socket.setTimeout(5000);
      socket.once('connect', () => {
        socket.end();
        resolve(true);
      });
      socket.once('error', () => resolve(false));
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });
}

const required: [name: string, probe: Probe][] = [
  ['Supabase API on 54321', responds(`${SUPABASE_URL}/auth/v1/health`, ok)],
  [
    'Supabase email confirmations (apps/web/supabase/config.toml enable_confirmations = true, applied by a Supabase restart)',
    responds(`${SUPABASE_URL}/auth/v1/settings`, async (response) => {
      const settings: { mailer_autoconfirm: boolean } = await response.json();
      return settings.mailer_autoconfirm === false;
    }),
  ],
  ['Mailpit API on 54324', responds(`${MAILPIT_URL}/api/v1/info`, ok)],
  [`Mailpit SMTP on ${MAILPIT_SMTP_PORT}`, listens(MAILPIT_SMTP_PORT)],
  ['Gotenberg on 3009', responds(`${GOTENBERG_URL}/health`, ok)],
  ['Documenso on 3005', responds(DOCUMENSO_URL, async () => true)],
  ['Novu API on 3006', responds(`${NOVU_API_URL}/v1/health-check`, ok)],
  ['Temporal on 7233', listens(7233)],
];

export const workersArePolling = responds(
  `${TEMPORAL_UI_URL}/api/v1/namespaces/default/task-queues/${TEMPORAL_TASK_QUEUE}?taskQueueType=TASK_QUEUE_TYPE_WORKFLOW`,
  async (response) => {
    if (!response.ok) {
      return false;
    }
    // Temporal's JSON omits an empty pollers list.
    const queue: { pollers?: unknown[] } = await response.json();
    return (queue.pollers ?? []).length > 0;
  },
);

export async function missingServices(): Promise<string[]> {
  const results = await Promise.all(
    required.map(async ([name, probe]) => ((await probe()) ? [] : [name])),
  );
  return results.flat();
}
