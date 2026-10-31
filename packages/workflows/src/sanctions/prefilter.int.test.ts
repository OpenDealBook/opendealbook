import { createClient } from '@supabase/supabase-js';

import type { Client } from '@temporalio/client';

import { afterAll, expect, it } from 'vitest';

import '../../test-support/integration-harness';
import { startScreeningImport } from './activities';
import { parseCsl } from './csl';
import { loadScreeningList } from './load';
import { type ScreeningSubject, matchSubjects } from './match';
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

async function loaded() {
  const importId = crypto.randomUUID();
  imports.push(importId);
  await startScreeningImport({ importId });
  await loadScreeningList(importId, fixture, () => {});
  return importId;
}

afterAll(async () => {
  await admin.from('screening_import').delete().in('id', imports).throwOnError();
});

function nearNames(name: string): string[] {
  return [
    name,
    name.toLowerCase(),
    `${name} GmbH`,
    `The ${name}`,
    name.split(' ').reverse().join(' '),
    ...Array.from({ length: 10 }, (_, cut) => [name.slice(0, -(cut + 1)), name.slice(cut + 1)]).flat(),
    ...Array.from({ length: name.length }, (_, at) => `${name.slice(0, at)}x${name.slice(at + 1)}`),
  ];
}

async function namesOf(importId: string) {
  const { data: entries } = await admin
    .from('screening_entry')
    .select('id')
    .eq('import_id', importId)
    .throwOnError();
  const { data: names } = await admin
    .from('screening_name')
    .select('entry_id, variant, key, pairs')
    .in(
      'entry_id',
      entries.map((entry) => entry.id),
    )
    .order('entry_id')
    .order('variant')
    .order('key')
    .throwOnError();
  return { entryIds: entries.map((entry) => entry.id), names };
}

async function withoutNames(importId: string) {
  const { entryIds } = await namesOf(importId);
  await admin.from('screening_name').delete().in('entry_id', entryIds).throwOnError();
}

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

const owner: ScreeningSubject = { key: 'owner', name: 'Vladimir Putin', kind: 'person' };

it('refuses to screen a list loaded before keys existed', async () => {
  await withoutNames(await loaded());

  await expect(screenSubjects([owner])).rejects.toThrow('The sanctions list is not indexed yet');
});

it('keys an import loaded before keys existed when the worker starts', async () => {
  await withoutNames(await loaded());
  const { client, triggered } = recordingClient();

  await ensureScreeningListLoaded(client);

  expect(triggered).toEqual([]);
  expect(await screenSubjects([owner])).toMatchObject({
    candidates: [{ subjectKey: 'owner', matchedName: 'PUTIN, Vladimir', score: 1 }],
  });
});

it('leaves existing keys as they are when the worker starts again', async () => {
  const importId = await loaded();
  const before = await namesOf(importId);

  await ensureScreeningListLoaded(recordingClient().client);

  expect(before.names.length).toBeGreaterThan(0);
  expect(await namesOf(importId)).toEqual(before);
});

it('screens every candidate when more than a page of entries match', async () => {
  const importId = crypto.randomUUID();
  imports.push(importId);
  await startScreeningImport({ importId });
  await admin
    .from('screening_entry')
    .insert(
      Array.from({ length: 1001 }, (_, i) => ({
        import_id: importId,
        list_name: 'Specially Designated Nationals (SDN) - Treasury Department',
        source_entry_id: `corvin-${i}`,
        name: 'Corvin Ashdale',
        entry_type: 'individual',
        source_url: 'https://csl.test/sdn',
        as_of: '2026-10-26',
        raw: {},
      })),
    )
    .throwOnError();
  await admin
    .from('screening_import')
    .update({ status: 'succeeded', as_of: '2026-10-26T11:15:00Z', entry_count: 1001 })
    .eq('id', importId)
    .throwOnError();
  await ensureScreeningListLoaded(recordingClient().client);

  const screened = await screenSubjects([
    { key: 'owner', name: 'Corvin Ashdale', kind: 'person' },
  ]);

  expect(screened).toHaveProperty('candidates');
  expect(
    new Set(
      (screened as Extract<typeof screened, { candidates: unknown }>).candidates.map(
        (candidate) => candidate.sourceEntryId,
      ),
    ).size,
  ).toBe(1001);
});

it('screens the same candidates as comparing every list entry', async () => {
  const { entries } = parseCsl(fixture);
  const subjects: ScreeningSubject[] = [
    ...entries.flatMap((entry) => [entry.name, ...entry.alt_names]).flatMap(nearNames),
    'Hollow Creek Construction',
    'Q',
    '',
  ].flatMap((name, i) => [
    { key: `p${i}`, name, kind: 'person' as const },
    { key: `b${i}`, name, kind: 'business' as const },
  ]);
  const matching = subjects.filter((subject) => matchSubjects([subject], entries).length > 0);
  await loaded();

  const screened = await Promise.all(matching.map((subject) => screenSubjects([subject])));

  expect(matchSubjects(matching, entries).some((candidate) => candidate.score < 0.86)).toBe(true);
  expect(screened).toEqual(
    matching.map((subject) => ({ candidates: matchSubjects([subject], entries) })),
  );
  expect(await screenSubjects(subjects)).toEqual({
    candidates: matchSubjects(subjects, entries),
  });
});
