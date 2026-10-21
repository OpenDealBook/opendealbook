import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { connect } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const webDir = fileURLToPath(new URL('../apps/web', import.meta.url));
const WORKERS_ENV_FILE = 'apps/e2e/.e2e-workers.env';
const WEB_PORT = 3000;
const TASK_QUEUE_URL =
  'http://localhost:8233/api/v1/namespaces/default/task-queues/opendealbook?taskQueueType=TASK_QUEUE_TYPE_WORKFLOW';
const WORKER_POLL_DEADLINE_MS = 120_000;
const MATCH_NO_TESTS = '^$';

const groupLeaders = [];

function spawnInOwnGroup(command, args, options) {
  const child = spawn(command, args, { ...options, detached: true });
  groupLeaders.push(child);
  return child;
}

function stopAll() {
  for (const { pid } of groupLeaders) {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH' && error.code !== 'EPERM') throw error;
    }
  }
}

process.on('exit', stopAll);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

function listens(port) {
  return new Promise((resolve) => {
    const socket = connect(port, 'localhost');
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

function exitCodeOf(child) {
  return new Promise((resolve) =>
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0))),
  );
}

// The html reporter otherwise serves the report after a failure and never exits.
function playwright(args) {
  return spawnInOwnGroup(
    'pnpm',
    ['--filter', 'e2e', 'exec', 'playwright', 'test', ...args],
    {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, PLAYWRIGHT_HTML_OPEN: 'never' },
    },
  );
}

function supabaseIsRunning() {
  try {
    execFileSync('pnpm', ['exec', 'supabase', 'status'], {
      cwd: webDir,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

async function freshPollerSince(startedAt) {
  const response = await fetch(TASK_QUEUE_URL);
  const queue = await response.json();
  return (queue.pollers ?? []).some(
    (poller) => Date.parse(poller.lastAccessTime) >= startedAt,
  );
}

if (await listens(WEB_PORT)) {
  console.error(
    `Port ${WEB_PORT} in use. e2e needs it; stop pnpm run-dev first, or whatever else holds it.`,
  );
  process.exit(1);
}

run(
  'docker',
  [
    'compose',
    '--profile',
    'core',
    '--profile',
    'notifications',
    '--profile',
    'observability',
    'up',
    '-d',
  ],
  root,
);

if (!supabaseIsRunning()) {
  run('pnpm', ['exec', 'supabase', 'start'], webDir);
}

if (!existsSync(`${root}${WORKERS_ENV_FILE}`)) {
  console.log(
    `Minting ${WORKERS_ENV_FILE} with a global-setup-only Playwright run.`,
  );
  await exitCodeOf(playwright(['--grep', MATCH_NO_TESTS]));
  if (!existsSync(`${root}${WORKERS_ENV_FILE}`)) {
    console.error(
      `The global setup did not write ${WORKERS_ENV_FILE}; see its output above.`,
    );
    process.exit(1);
  }
}

const workerStartedAt = Date.now();
const worker = spawnInOwnGroup(
  'sh',
  [
    '-c',
    `set -a && . ${WORKERS_ENV_FILE} && set +a && exec pnpm --filter workers dev`,
  ],
  { cwd: root, stdio: 'inherit' },
);
const workerExit = exitCodeOf(worker);

while (!(await freshPollerSince(workerStartedAt))) {
  if (
    worker.exitCode !== null ||
    Date.now() - workerStartedAt > WORKER_POLL_DEADLINE_MS
  ) {
    console.error('The e2e worker never polled the opendealbook task queue.');
    process.exit(1);
  }
  await sleep(1000);
}

const testsExitCode = await exitCodeOf(playwright(process.argv.slice(2)));
stopAll();
await workerExit;
process.exit(testsExitCode);
