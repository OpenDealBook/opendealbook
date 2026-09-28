import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(scriptDir, '..', '..', '..');
const webDir = join(monorepoRoot, 'apps', 'web');
const envLocalPath = join(webDir, '.env.local');
const configTomlPath = join(webDir, 'supabase', 'config.toml');
const packagesDir = join(monorepoRoot, 'packages');

const requiredEnvKeys = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SITE_URL',
];

const defaultSupabasePorts = {
  api: 54321,
  db: 54322,
  studio: 54323,
  inbucket: 54324,
};

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

function readSupabasePorts(path: string): typeof defaultSupabasePorts {
  const ports = { ...defaultSupabasePorts };

  if (!existsSync(path)) {
    return ports;
  }

  let section = '';

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const header = line.match(/^\s*\[([^\]]+)\]/);

    if (header) {
      section = header[1]!;
      continue;
    }

    const port = line.match(/^\s*port\s*=\s*(\d+)/);

    if (port && section in ports) {
      ports[section as keyof typeof ports] = Number(port[1]);
    }
  }

  return ports;
}

function tuckinPackageNames(root: string): string[] {
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
const ports = readSupabasePorts(configTomlPath);
const packages = tuckinPackageNames(packagesDir);

const mark = (ok: boolean) => (ok ? 'ok' : 'missing');

console.log('Open Deal Book local environment status');
console.log('=======================================');
console.log('');
console.log('Web app: ' + webDir);
console.log('.env.local: ' + mark(existsSync(envLocalPath)));
console.log('');
console.log('Local Supabase endpoints');
console.log('  API:     http://127.0.0.1:' + ports.api);
console.log('  Studio:  http://127.0.0.1:' + ports.studio);
console.log('  Mailbox: http://127.0.0.1:' + ports.inbucket);
console.log(
  '  Database: postgresql://postgres:postgres@127.0.0.1:' +
    ports.db +
    '/postgres',
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
