import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const webDir = fileURLToPath(new URL('../apps/web', import.meta.url));

const LOCAL_MAIL_DEFAULTS = {
  SELLER_DELIVERY_FROM_EMAIL: 'updates@opendealbook.local',
  TRIAL_DRIP_FROM_EMAIL: 'trial@opendealbook.local',
  MAILER_PROVIDER: 'nodemailer',
  EMAIL_HOST: '127.0.0.1',
  EMAIL_PORT: '54325',
  EMAIL_TLS: 'false',
  NOVU_API_URL: 'http://localhost:3006',
};

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

function supabaseStatus() {
  return execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], {
    cwd: webDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function parseEnv(text) {
  return Object.fromEntries(
    [...text.matchAll(/^([A-Z_]+)="?(.*?)"?$/gm)].map(([, key, value]) => [
      key,
      value,
    ]),
  );
}

function localSupabase() {
  try {
    return parseEnv(supabaseStatus());
  } catch {
    run('pnpm', ['exec', 'supabase', 'start'], webDir);
    return parseEnv(supabaseStatus());
  }
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

const supabase = localSupabase();

const workersEnv = {
  NEXT_PUBLIC_SUPABASE_URL: supabase.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supabase.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: supabase.SERVICE_ROLE_KEY,
  ...LOCAL_MAIL_DEFAULTS,
  ...process.env,
};

// pnpm does not forward SIGTERM to `next dev` or the worker, so each child gets
// its own process group and stopAll signals the whole group.
function startInOwnGroup(filter, env) {
  return spawn('pnpm', ['--filter', filter, 'dev'], {
    cwd: root,
    stdio: 'inherit',
    detached: true,
    env,
  });
}

const children = [
  startInOwnGroup('web', process.env),
  startInOwnGroup('workers', workersEnv),
];

function stopAll() {
  children
    .filter((child) => child.exitCode === null && child.signalCode === null)
    .forEach((child) => process.kill(-child.pid, 'SIGTERM'));
}

process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
children.forEach((child) =>
  child.on('exit', (code) => {
    stopAll();
    process.exitCode ||= code ?? 0;
  }),
);
