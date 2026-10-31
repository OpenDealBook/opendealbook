import { createClient } from '@supabase/supabase-js';

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import '../../test-support/integration-harness';
import { downloadedLicenses, failFloridaLicenseImport, startFloridaLicenseImport } from './activities';
import { loadFloridaLicenseSnapshot } from './load';
import type { FloridaLicense } from './parse';

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const dbpr = {
  origin: '',
  requested: [] as string[],
  emptyFile: null as string | null,
  stalledFile: null as string | null,
  trickle: false,
  failingFile: null as string | null,
  abandoned: [] as string[],
  close: () => {},
};
const imports: string[] = [];

beforeAll(async () => {
  const server = createServer((request, response) => {
    dbpr.requested.push(request.url!);
    const file = request.url!.slice(request.url!.lastIndexOf('/') + 1);
    if (file === dbpr.failingFile) {
      response.writeHead(503).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/csv' });
    if (file === dbpr.stalledFile) {
      response.write('"06","CBC"');
      return;
    }
    if (file === dbpr.emptyFile) {
      response.end('');
      return;
    }
    const body = readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8');
    if (dbpr.trickle) {
      const lines = body.split(/(?<=\n)/);
      response.on('close', () => {
        if (!response.writableEnded) {
          dbpr.abandoned.push(file);
        }
      });
      const next = () => {
        if (response.destroyed) {
          return;
        }
        const line = lines.shift();
        if (line === undefined) {
          response.end();
          return;
        }
        response.write(line);
        setTimeout(next, 40);
      };
      next();
      return;
    }
    response.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  dbpr.origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/sto/file_download/extracts`;
  dbpr.close = () => {
    server.closeAllConnections();
    server.close();
  };
});

beforeEach(() => {
  dbpr.emptyFile = null;
  dbpr.stalledFile = null;
  dbpr.trickle = false;
  dbpr.failingFile = null;
  dbpr.abandoned.length = 0;
});

afterAll(async () => {
  dbpr.close();
  await admin.from('florida_license_import').delete().in('id', imports).throwOnError();
});

async function started() {
  const importId = crypto.randomUUID();
  imports.push(importId);
  await startFloridaLicenseImport({ importId });
  return importId;
}

async function readImport(importId: string) {
  const { data } = await admin
    .from('florida_license_import')
    .select('status, license_count, error')
    .eq('id', importId)
    .single()
    .throwOnError();
  return data;
}

async function licensesOf(importId: string) {
  const { data } = await admin
    .from('florida_license')
    .select('file, licensee_name, normalized_names, license_number, license_type, status, expires_on')
    .eq('import_id', importId)
    .order('id')
    .throwOnError();
  return data;
}

function loadFloridaLicenses({ importId }: { importId: string }, origin: string) {
  return loadFloridaLicenseSnapshot({
    importId,
    licenses: downloadedLicenses({ origin }),
    signal: new AbortController().signal,
    heartbeat: () => {},
  });
}

function license(index: number): FloridaLicense {
  return {
    file: 'CONSTRUCTIONLICENSE_1.csv',
    licensee_name: `HARBOR FIXTURE ${index}`,
    normalized_names: [`harbor fixture ${index}`],
    license_number: `CBC${index}`,
    license_type: 'CBC',
    status: 'Active',
    expires_on: null,
    raw: [],
  };
}

async function partialRows(importId: string) {
  await admin
    .from('florida_license')
    .insert({
      import_id: importId,
      file: 'CONSTRUCTIONLICENSE_1.csv',
      licensee_name: 'HARBOR FIXTURE LEFTOVER',
      normalized_names: ['harbor fixture leftover'],
      license_type: 'CBC',
      raw: [],
    })
    .throwOnError();
}

describe('loading the Florida license files', () => {
  it('downloads each DBPR file and keeps every license held under a business name', async () => {
    const importId = await started();

    await loadFloridaLicenses({ importId }, dbpr.origin);

    expect(dbpr.requested).toEqual([
      '/sto/file_download/extracts/CONSTRUCTIONLICENSE_1.csv',
      '/sto/file_download/extracts/COSMETOLOGYLICENSE_1.csv',
      '/sto/file_download/extracts/REALESTATE2501LICENSE_1.csv',
    ]);
    expect(await readImport(importId)).toEqual({ status: 'succeeded', license_count: 12, error: null });
    expect(await licensesOf(importId)).toEqual([
      expect.objectContaining({ licensee_name: 'HARBOR FIXTURE DENTAL, LLC', normalized_names: ['harbor fixture dental'], license_number: 'TESTCBC0001', status: 'Active', expires_on: '2028-08-31' }),
      expect.objectContaining({ licensee_name: "MARSH & O'NEIL BUILDERS INC" }),
      expect.objectContaining({ licensee_name: 'HARBOUR HOLDINGS INC.', normalized_names: ['harbour holdings', 'harbor fixture air'], license_number: null }),
      expect.objectContaining({ licensee_name: 'HARBOR FIXTURE MECHANICAL INC.' }),
      expect.objectContaining({ licensee_name: 'HARBOR FIXTURE GLASS', expires_on: null }),
      expect.objectContaining({ file: 'COSMETOLOGYLICENSE_1.csv', licensee_name: 'HARBOR FIXTURE SALON' }),
      expect.objectContaining({ file: 'COSMETOLOGYLICENSE_1.csv', licensee_name: 'HARBOR FIXTURE NAILS', status: null }),
      expect.objectContaining({ file: 'REALESTATE2501LICENSE_1.csv', licensee_name: 'EXAMPLE, PAT', normalized_names: ['example pat', 'harbor fixture realty'], status: 'Active', expires_on: '2027-09-30' }),
      expect.objectContaining({ file: 'REALESTATE2501LICENSE_1.csv', licensee_name: 'SAMPLE, SAM', status: 'Inactive' }),
      expect.objectContaining({ file: 'REALESTATE2501LICENSE_1.csv', license_number: 'TESTBK0010' }),
      expect.objectContaining({ license_number: 'TESTBK0011', expires_on: '1999-03-31' }),
      expect.objectContaining({ license_number: 'TESTBK0012', expires_on: null }),
    ]);
  });

  it('converges to one full snapshot when a load that stopped partway is retried', async () => {
    const importId = await started();
    await partialRows(importId);

    await loadFloridaLicenses({ importId }, dbpr.origin);

    expect((await licensesOf(importId)).map((license) => license.licensee_name)).not.toContain('HARBOR FIXTURE LEFTOVER');
    expect(await licensesOf(importId)).toHaveLength(12);
    expect(await readImport(importId)).toEqual({ status: 'succeeded', license_count: 12, error: null });
  });

  it('never reloads an import that already succeeded when its load is retried', async () => {
    const importId = await started();
    await loadFloridaLicenses({ importId }, dbpr.origin);
    dbpr.emptyFile = 'CONSTRUCTIONLICENSE_1.csv';

    await loadFloridaLicenses({ importId }, dbpr.origin);

    expect(await licensesOf(importId)).toHaveLength(12);
    expect(await readImport(importId)).toEqual({ status: 'succeeded', license_count: 12, error: null });
  });

  it('drops the licenses of older succeeded imports once a newer one succeeds, keeping their log and any running import', async () => {
    const older = await started();
    await loadFloridaLicenses({ importId: older }, dbpr.origin);
    const running = await started();
    await partialRows(running);
    const newer = await started();
    await loadFloridaLicenses({ importId: newer }, dbpr.origin);

    expect(await licensesOf(older)).toEqual([]);
    expect(await readImport(older)).toMatchObject({ status: 'succeeded' });
    expect(await licensesOf(running)).toHaveLength(1);
    expect(await licensesOf(newer)).toHaveLength(12);
  });

  it('never succeeds when a file has no licenses, and keeps the current snapshot', async () => {
    const loaded = await started();
    await loadFloridaLicenses({ importId: loaded }, dbpr.origin);
    const empty = await started();
    dbpr.emptyFile = 'COSMETOLOGYLICENSE_1.csv';

    await expect(loadFloridaLicenses({ importId: empty }, dbpr.origin)).rejects.toThrow(
      'The Florida file COSMETOLOGYLICENSE_1.csv had no licenses',
    );

    expect(await readImport(empty)).toMatchObject({ status: 'running' });
    expect(await licensesOf(loaded)).toHaveLength(12);
  });

  it('gives up on a download that stalls past its time limit', async () => {
    dbpr.stalledFile = 'CONSTRUCTIONLICENSE_1.csv';

    const reading = (async () => {
      for await (const license of downloadedLicenses({ origin: dbpr.origin, stallMs: 200 })) {
        void license;
      }
    })();

    await expect(reading).rejects.toThrow('stalled: no data for 200 ms');
  });

  it('keeps downloading past the time limit, with a reader slower than the limit, as long as bytes keep arriving', async () => {
    dbpr.trickle = true;
    const read: string[] = [];

    for await (const license of downloadedLicenses({ origin: dbpr.origin, stallMs: 100 })) {
      read.push(license.licensee_name);
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    expect(read).toHaveLength(12);
  });

  it('stops inserting once the load is cancelled', async () => {
    const importId = await started();
    const cancel = new AbortController();
    async function* licenses() {
      for (let index = 0; index < 5000; index += 1) {
        if (index === 1500) {
          cancel.abort();
        }
        yield license(index);
      }
    }

    await expect(
      loadFloridaLicenseSnapshot({ importId, licenses: licenses(), signal: cancel.signal, heartbeat: () => {} }),
    ).rejects.toThrow('This operation was aborted');
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(await licensesOf(importId)).toHaveLength(1000);
    expect(await readImport(importId)).toMatchObject({ status: 'running' });
  });

  it('reports its progress once per batch it inserts, with no empty batch when the count is a whole number of batches', async () => {
    const importId = await started();
    const progress: number[] = [];
    async function* licenses() {
      for (let index = 0; index < 2000; index += 1) {
        yield license(index);
      }
    }

    await loadFloridaLicenseSnapshot({
      importId,
      licenses: licenses(),
      signal: new AbortController().signal,
      heartbeat: (inserted) => progress.push(inserted),
    });

    expect(progress).toEqual([1000, 2000]);
    expect(await readImport(importId)).toEqual({ status: 'succeeded', license_count: 2000, error: null });
  });

  it('fails the download when DBPR answers with an error', async () => {
    dbpr.failingFile = 'COSMETOLOGYLICENSE_1.csv';

    const reading = (async () => {
      for await (const license of downloadedLicenses({ origin: dbpr.origin })) {
        void license;
      }
    })();

    await expect(reading).rejects.toThrow(`GET ${dbpr.origin}/COSMETOLOGYLICENSE_1.csv answered 503`);
  });

  it('closes the download when the reader stops early', async () => {
    dbpr.trickle = true;

    for await (const license of downloadedLicenses({ origin: dbpr.origin })) {
      void license;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(dbpr.abandoned).toEqual(['CONSTRUCTIONLICENSE_1.csv']);
  });

  it('drops the licenses left behind by failed imports once an import succeeds', async () => {
    const failed = await started();
    await partialRows(failed);
    await admin.from('florida_license_import').update({ status: 'failed' }).eq('id', failed).throwOnError();
    const newer = await started();

    await loadFloridaLicenses({ importId: newer }, dbpr.origin);

    expect(await licensesOf(failed)).toEqual([]);
  });

  it('never marks an import that already succeeded as failed, and keeps its licenses', async () => {
    const importId = await started();
    await loadFloridaLicenses({ importId }, dbpr.origin);

    await failFloridaLicenseImport({ importId, reason: 'late failure from an earlier attempt' });

    expect(await readImport(importId)).toEqual({ status: 'succeeded', license_count: 12, error: null });
    expect(await licensesOf(importId)).toHaveLength(12);
  });

  it('records why an import failed and deletes the licenses it had loaded so far', async () => {
    const importId = await started();
    await partialRows(importId);

    await failFloridaLicenseImport({ importId, reason: 'GET https://www2.myfloridalicense.com answered 503' });

    expect(await readImport(importId)).toEqual({
      status: 'failed',
      license_count: null,
      error: 'GET https://www2.myfloridalicense.com answered 503',
    });
    expect(await licensesOf(importId)).toEqual([]);
  });
});
