import { createClient } from '@supabase/supabase-js';

import type { Client } from '@temporalio/client';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import '../../test-support/integration-harness';
import { failScreeningImport, startScreeningImport } from './activities';
import { loadScreeningList } from './load';
import { ensureScreeningListLoaded } from './schedules';
import { screenSubjects } from './screenSubjects';

import { readFileSync } from 'node:fs';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const fixture = readFileSync(
  new URL('./fixtures/consolidated.json', import.meta.url),
  'utf8',
);

const imports: string[] = [];

async function started() {
  const importId = crypto.randomUUID();
  imports.push(importId);
  await startScreeningImport({ importId });
  return importId;
}

async function readImport(importId: string) {
  const { data } = await admin
    .from('screening_import')
    .select('status, as_of, entry_count')
    .eq('id', importId)
    .single()
    .throwOnError();
  return data;
}

async function entryCount(importId: string) {
  const { count } = await admin
    .from('screening_entry')
    .select('*', { count: 'exact', head: true })
    .eq('import_id', importId)
    .throwOnError();
  return count;
}

let preexisting: string[] = [];

beforeAll(async () => {
  const { data } = await admin
    .from('screening_import')
    .select('id')
    .eq('status', 'succeeded')
    .throwOnError();
  preexisting = data.map((existing) => existing.id);
});

afterAll(async () => {
  await admin.from('screening_import').delete().in('id', imports).throwOnError();
  for (const importId of preexisting) {
    if ((await entryCount(importId)) === 0) {
      await admin.from('screening_import').delete().eq('id', importId).throwOnError();
    }
  }
});

describe('loadScreeningList', () => {
  it('converges to the same snapshot when a load is retried', async () => {
    const importId = await started();

    await loadScreeningList(importId, fixture, () => {});
    const first = await readImport(importId);
    await loadScreeningList(importId, fixture, () => {});

    expect(first).toEqual({
      status: 'succeeded',
      as_of: '2026-10-27T11:15:00.018748+00:00',
      entry_count: 6,
    });
    expect(await readImport(importId)).toEqual(first);
    expect(await entryCount(importId)).toBe(6);
  });

  it('drops the entries of older imports once a newer one succeeds, keeping their log', async () => {
    const older = await started();
    await loadScreeningList(older, fixture, () => {});
    const newer = await started();
    await loadScreeningList(newer, fixture, () => {});

    expect(await entryCount(older)).toBe(0);
    expect(await readImport(older)).toMatchObject({ status: 'succeeded' });
    expect(await entryCount(newer)).toBe(6);
  });

  it('never succeeds with a file that has no entries and keeps the current snapshot', async () => {
    const loaded = await started();
    await loadScreeningList(loaded, fixture, () => {});
    const empty = await started();

    await expect(
      loadScreeningList(
        empty,
        JSON.stringify({ ...JSON.parse(fixture), results: [] }),
        () => {},
      ),
    ).rejects.toThrow('The sanctions list file had no entries');

    expect(await readImport(empty)).toMatchObject({ status: 'running' });
    expect(await entryCount(loaded)).toBe(6);
  });

  it('records and logs why an import failed', async () => {
    const importId = await started();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await failScreeningImport({
      importId,
      reason: 'GET https://data.trade.gov answered 503',
    });

    const { data } = await admin
      .from('screening_import')
      .select('status, error')
      .eq('id', importId)
      .single()
      .throwOnError();
    expect(data).toEqual({
      status: 'failed',
      error: 'GET https://data.trade.gov answered 503',
    });
    expect(logged.mock.calls.flat().join(' ')).toContain(
      'GET https://data.trade.gov answered 503',
    );
    logged.mockRestore();
  });

  it('starting the same import twice keeps one running import', async () => {
    const importId = await started();
    await startScreeningImport({ importId });

    expect(await readImport(importId)).toEqual({
      status: 'running',
      as_of: null,
      entry_count: null,
    });
  });
});

describe('screenSubjects', () => {
  it('screens against the newest succeeded snapshot only', async () => {
    const loaded = await started();
    await loadScreeningList(loaded, fixture, () => {});
    const unfinished = await started();
    await admin
      .from('screening_entry')
      .insert({
        import_id: unfinished,
        list_name: 'Specially Designated Nationals (SDN) - Treasury Department',
        source_entry_id: 'unfinished-1',
        name: 'Hollow Creek Construction',
        source_url: 'https://csl.test/sdn',
        as_of: '2026-11-02',
        raw: {},
      })
      .throwOnError();

    const result = await screenSubjects([
      { key: 'owner', name: 'Vladimir Putin', kind: 'person' },
      { key: 'seller', name: 'Hollow Creek Construction', kind: 'business' },
      { key: 'boat', name: 'Mar Azul', kind: 'business' },
    ]);

    expect(result).toHaveProperty('candidates');
    const { candidates } = result as Extract<typeof result, { candidates: unknown }>;
    expect(
      candidates.map((candidate) => [
        candidate.subjectKey,
        candidate.matchedName,
        candidate.score,
        candidate.entryType,
        candidate.countries,
        (candidate.raw as { id: string }).id,
      ]),
    ).toEqual([['owner', 'PUTIN, Vladimir', 1, 'individual', ['RU'], '35096']]);
  });
});

describe('screenSubjects with an empty snapshot', () => {
  it('reports the list as not loaded', async () => {
    const empty = await started();
    await admin
      .from('screening_import')
      .update({ status: 'succeeded', as_of: '2026-10-27T11:15:00Z', entry_count: 26173 })
      .eq('id', empty)
      .throwOnError();

    expect(
      await screenSubjects([{ key: 'owner', name: 'Vladimir Putin', kind: 'person' }]),
    ).toEqual({ skipped: 'The sanctions list is not loaded yet' });
  });
});

function recordingClient() {
  const triggered: string[] = [];
  const client = {
    schedule: {
      getHandle: (scheduleId: string) => ({
        trigger: async () => {
          triggered.push(scheduleId);
        },
      }),
    },
  } as unknown as Client;
  return { client, triggered };
}

describe('ensureScreeningListLoaded', () => {
  it('imports the list when the current import holds no entries', async () => {
    const empty = await started();
    await admin
      .from('screening_import')
      .update({ status: 'succeeded', as_of: '2026-10-27T11:15:00Z', entry_count: 26173 })
      .eq('id', empty)
      .throwOnError();
    const { client, triggered } = recordingClient();

    await ensureScreeningListLoaded(client);

    expect(triggered).toEqual(['sanctions-import-csl']);
  });

  it('leaves a loaded list to its weekly schedule', async () => {
    const loaded = await started();
    await loadScreeningList(loaded, fixture, () => {});
    const triggered: string[] = [];
    const client = {
      schedule: {
        getHandle: (scheduleId: string) => ({
          trigger: async () => {
            triggered.push(scheduleId);
          },
        }),
      },
    } as unknown as Client;

    await ensureScreeningListLoaded(client);

    expect(triggered).toEqual([]);
  });
});
