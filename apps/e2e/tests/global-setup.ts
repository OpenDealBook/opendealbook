import {
  MAILPIT_SMTP_PORT,
  VARIANT_URL,
  WEB_URL,
  WEB_URL_FROM_DOCKER,
} from './fixtures/stack';
import { documensoApiKey } from './stack/documenso';
import {
  SENDER,
  mainServerEnv,
  variantServerEnv,
  workersEnv,
} from './stack/env';
import { novuApiKey, pointNovuEmailAt, syncNovuBridge } from './stack/novu';
import { missingServices, workersArePolling } from './stack/services';
import { buildWebServer, startWebServer } from './stack/web-server';
import { startStandIns } from './stand-ins';

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WORKERS_ENV_FILE = fileURLToPath(
  new URL('../.e2e-workers.env', import.meta.url),
);
const START_WORKERS = `set -a && . apps/e2e/.e2e-workers.env && set +a && pnpm --filter workers dev`;

async function withRetries<Value>(
  attempts: number,
  run: () => Promise<Value>,
): Promise<Value> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt === attempts) {
        throw error;
      }
    }
  }
}

function failWith(lines: string[]): never {
  throw new Error(lines.join('\n'));
}

function writeWorkersEnv(env: Record<string, string>) {
  writeFileSync(
    WORKERS_ENV_FILE,
    Object.entries(env)
      .map(([key, value]) => `${key}='${value.replaceAll("'", `'\\''`)}'`)
      .join('\n') + '\n',
  );
}

export default async function globalSetup() {
  const missing = await missingServices();

  if (missing.length > 0) {
    failWith([
      'The e2e stack is incomplete. Start these and rerun:',
      ...missing.map((name) => `  - ${name}`),
    ]);
  }

  const builds = Promise.all([
    buildWebServer({
      name: 'main',
      env: mainServerEnv({ novuApiKey: 'build', documensoApiKey: 'build' }),
    }),
    buildWebServer({
      name: 'variant',
      env: variantServerEnv({ novuApiKey: 'build' }),
    }),
  ]);
  builds.catch(() => undefined);

  const stopStandIns = await startStandIns();
  const novuKey = await novuApiKey();
  await pointNovuEmailAt(novuKey, {
    host: 'host.docker.internal',
    port: MAILPIT_SMTP_PORT,
    from: SENDER.address,
    senderName: SENDER.name,
  });
  writeWorkersEnv(workersEnv(novuKey));
  console.log(
    `Workers env written to ${WORKERS_ENV_FILE}. Start the workers with:\n  ${START_WORKERS}`,
  );

  if (!(await workersArePolling())) {
    failWith([
      'No Temporal worker is polling the opendealbook task queue.',
      'Start the workers with the e2e env from the repo root, then rerun:',
      `  ${START_WORKERS}`,
    ]);
  }

  const documensoKey = await withRetries(3, () =>
    documensoApiKey({
      webhookUrl: `${WEB_URL_FROM_DOCKER}/api/webhooks/documenso`,
    }),
  );

  await builds;

  const stopServers = await Promise.all([
    startWebServer({
      name: 'main',
      url: WEB_URL,
      env: mainServerEnv({
        novuApiKey: novuKey,
        documensoApiKey: documensoKey,
      }),
    }),
    startWebServer({
      name: 'variant',
      url: VARIANT_URL,
      env: variantServerEnv({ novuApiKey: novuKey }),
    }),
  ]);
  await syncNovuBridge(novuKey, `${WEB_URL_FROM_DOCKER}/api/novu`);

  return async () => {
    stopServers.forEach((stop) => stop());
    await stopStandIns();
  };
}
