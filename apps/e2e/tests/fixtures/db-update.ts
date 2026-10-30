import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

function psql(sql: string) {
  return run('docker', [
    'exec',
    process.env.SUPABASE_DB_CONTAINER ??
      `${process.env.COMPOSE_PROJECT_NAME ?? 'opendealbook'}-db-1`,
    'psql',
    '-U',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    sql,
  ]);
}

// The business creation form has no owner field, so the firm's owner names are
// set through the database container.
export async function setFirmOwnerNames(firmId: string, names: string[]) {
  const array = names.map((name) => `'${name.replaceAll("'", "''")}'`).join(', ');
  await psql(`update public.firm set owner_names = array[${array}] where id = '${firmId}'`);
}

export async function deleteDataRoomDocument(id: string) {
  await psql(`delete from public.dr_document where id = '${id}'`);
}
