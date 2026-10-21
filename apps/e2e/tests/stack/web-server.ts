import { listens } from './services';

import { spawn } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const LOG_DIR = fileURLToPath(new URL('../../.stack-logs/', import.meta.url));
const READY_TIMEOUT_MS = 180_000;
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SOURCE_ROOTS = ['apps/web', 'packages', 'apps/e2e/tests/stack'];
const NOT_SOURCE = new Set([
  'node_modules',
  '.next',
  'dist',
  '.stack-logs',
  'test-results',
]);

export interface WebServer {
  name: string;
  url: string;
  env: Record<string, string>;
}

async function waitUntilServing(url: string, exited: () => boolean) {
  const deadline = Date.now() + READY_TIMEOUT_MS;

  while (Date.now() < deadline && !exited()) {
    const answered = await fetch(url).then(
      () => true,
      () => false,
    );
    if (answered) {
      return true;
    }
    await sleep(1000);
  }

  return false;
}

const DEV_MODE = process.env.E2E_DEV === '1';
const SKIP_BUILD = process.env.E2E_SKIP_BUILD === '1';

function newestSourceChange(dir: string): number {
  return readdirSync(dir, { withFileTypes: true }).reduce((newest, entry) => {
    if (NOT_SOURCE.has(entry.name)) {
      return newest;
    }
    const path = `${dir}/${entry.name}`;
    const changed = entry.isDirectory()
      ? newestSourceChange(path)
      : statSync(path).mtimeMs;
    return Math.max(newest, changed);
  }, 0);
}

function buildIsFresh(distDir: string): boolean {
  const marker = `${REPO_ROOT}apps/web/${distDir}/BUILD_ID`;

  return (
    existsSync(marker) &&
    statSync(marker).mtimeMs >
      Math.max(
        ...SOURCE_ROOTS.map((root) => newestSourceChange(`${REPO_ROOT}${root}`)),
      )
  );
}

export function buildWebServer({
  name,
  env,
}: Omit<WebServer, 'url'>): Promise<void> {
  if (DEV_MODE || SKIP_BUILD || buildIsFresh(env.NEXT_DIST_DIR!)) {
    return Promise.resolve();
  }

  mkdirSync(LOG_DIR, { recursive: true });
  const logPath = `${LOG_DIR}${name}-build.log`;
  const log = createWriteStream(logPath);
  const child = spawn('pnpm', ['--filter', 'web', 'exec', 'next', 'build'], {
    env: { ...process.env, ...env },
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  process.once('exit', () => child.kill());

  return new Promise((resolve, reject) => {
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `The e2e ${name} build failed; its output is in ${logPath}.`,
            ),
          ),
    );
  });
}

export async function startWebServer({
  name,
  url,
  env,
}: WebServer): Promise<() => void> {
  const port = Number(new URL(url).port);

  if (await listens(port)()) {
    throw new Error(
      `Port ${port} is already in use; stop that server so the e2e ${name} server can start there with the e2e env.`,
    );
  }

  mkdirSync(LOG_DIR, { recursive: true });
  const logPath = `${LOG_DIR}${name}.log`;
  const log = createWriteStream(logPath);
  const child = spawn(
    'pnpm',
    [
      '--filter',
      'web',
      'exec',
      'next',
      DEV_MODE ? 'dev' : 'start',
      '--port',
      String(port),
    ],
    { env: { ...process.env, ...env }, detached: true },
  );
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  let exited = false;
  child.once('exit', () => {
    exited = true;
  });
  const stop = () => {
    if (!exited) {
      process.kill(-child.pid!, 'SIGTERM');
    }
  };
  // Detached so the whole next dev process group can be stopped; this hook
  // stops it too when the runner exits early on a failed setup.
  process.once('exit', stop);

  if (!(await waitUntilServing(url, () => exited))) {
    stop();
    throw new Error(
      `The e2e ${name} server on ${url} did not start; its output is in ${logPath}.`,
    );
  }

  return stop;
}
