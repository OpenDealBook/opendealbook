import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(scriptDir, '..', '..', '..');
const webDir = join(monorepoRoot, 'apps', 'web');
const envLocalPath = join(webDir, '.env.local');
const packagesDir = join(monorepoRoot, 'packages');

const requiredEnvKeys = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SITE_URL',
];

function presentEnvKeys(path: string): Set<string> {
  const present = new Set<string>();

  if (!existsSync(path)) {
    return present;
  }

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);

    if (match && match[2]!.trim() !== '') {
      present.add(match[1]!);
    }
  }

  return present;
}

function odbPackageNames(root: string): string[] {
  const names: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') {
        continue;
      }

      const entryPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }

      if (entry.name === 'package.json') {
        const pkg = JSON.parse(readFileSync(entryPath, 'utf8')) as {
          name?: string;
        };

        if (pkg.name?.startsWith('@odb/')) {
          names.push(pkg.name);
        }
      }
    }
  };

  if (existsSync(root)) {
    walk(root);
  }

  return names.sort();
}

const present = presentEnvKeys(envLocalPath);
const packages = odbPackageNames(packagesDir);

const mark = (ok: boolean) => (ok ? 'ok' : 'missing');

console.log('Open Deal Book local environment status');
console.log('=======================================');
console.log('');
console.log('Web app: ' + webDir);
console.log('.env.local: ' + mark(existsSync(envLocalPath)));
console.log('');
console.log('Local Supabase endpoints');
console.log(
  '  API:     ' + (process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'),
);
console.log(
  '  Studio:  http://127.0.0.1:' +
    (process.env.SUPABASE_STUDIO_PORT ?? '54323'),
);
console.log(
  '  Mailbox: http://127.0.0.1:' + (process.env.MAILPIT_UI_PORT ?? '54324'),
);
console.log(
  '  Database: ' +
    (process.env.SUPABASE_DB_URL ??
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres'),
);
console.log('');
console.log('Required environment variables (presence only)');
for (const key of requiredEnvKeys) {
  console.log('  ' + key + ': ' + mark(present.has(key)));
}
console.log('');
console.log('@odb workspace packages (' + packages.length + ')');
for (const name of packages) {
  console.log('  ' + name);
}
