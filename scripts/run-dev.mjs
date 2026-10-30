import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const LOCAL_MAIL_DEFAULTS = {
  SELLER_DELIVERY_FROM_EMAIL: 'updates@opendealbook.local',
  TRIAL_DRIP_FROM_EMAIL: 'trial@opendealbook.local',
  MAILER_PROVIDER: 'nodemailer',
  EMAIL_HOST: '127.0.0.1',
  EMAIL_PORT: process.env.MAILPIT_SMTP_PORT ?? '54325',
  EMAIL_TLS: 'false',
  NOVU_API_URL: 'http://localhost:3006',
};

execFileSync(
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
  { cwd: root, stdio: 'inherit' },
);

execFileSync(
  'docker',
  [
    'compose',
    '--profile',
    'core',
    'up',
    '-d',
    '--wait',
    '--wait-timeout',
    '120',
    'db',
    'auth',
    'rest',
    'storage',
    'kong',
    'mailpit',
  ],
  { cwd: root, stdio: 'inherit' },
);

execFileSync('pnpm', ['db:migrate'], { cwd: root, stdio: 'inherit' });

const workersEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  SUPABASE_SERVICE_ROLE_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
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
