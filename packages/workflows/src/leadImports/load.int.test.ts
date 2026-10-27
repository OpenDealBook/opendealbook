import { createClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import '../../test-support/integration-harness';
import { failLeadImport, startLeadImport } from './activities';
import type { LeadFile } from './files';
import { loadLeadFile } from './load';

import { createReadStream } from 'node:fs';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const run = crypto.randomUUID();

function fixtureFile(
  ref: { kind: LeadFile['kind']; state?: string },
  fixture: string,
  asOf: string,
): LeadFile {
  return { ...ref, url: `fixture://${fixture}?${run}`, asOf } as LeadFile;
}

async function readRun(importId: string) {
  const { data } = await admin
    .from('lead_import')
    .select(
      'source, status, as_of, rows_read, rows_written, rows_rejected, rows_with_nulled_fields',
    )
    .eq('id', importId)
    .single()
    .throwOnError();
  return data;
}

async function loadFixture(importId: string, file: LeadFile) {
  const fixture = new URL(file.url).hostname + new URL(file.url).pathname;
  await loadLeadFile(
    importId,
    file,
    createReadStream(new URL(`./fixtures/${fixture}`, import.meta.url)),
    () => {},
  );
}

async function importTwice(file: LeadFile) {
  const importId = crypto.randomUUID();
  await startLeadImport({ importId, file });
  await loadFixture(importId, file);
  const first = await readRun(importId);
  await loadFixture(importId, file);
  return { importId, first, second: await readRun(importId) };
}

const PPP_LOANS = ['9000000001', '9000000002', '9000000003'];
const NY_ENTITIES = ['9424185', '9072354'];
const ACK_IDS = [
  '20260225154215NAL0000000001001',
  '20260225154432NAL0000000002001',
];

const businessIds: string[] = [];

async function clear() {
  const { data: imports } = await admin
    .from('lead_import')
    .select('id')
    .like('filename', `%?${run}`)
    .throwOnError();
  await admin
    .from('ppp_loan')
    .delete()
    .in('loan_number', PPP_LOANS)
    .throwOnError();
  await admin
    .from('public_business')
    .delete()
    .in('id', businessIds)
    .throwOnError();
  await admin
    .from('sba_loan')
    .delete()
    .in(
      'import_id',
      imports.map((row) => row.id),
    )
    .throwOnError();
  await admin
    .from('form_5500_filing')
    .delete()
    .in('ack_id', ACK_IDS)
    .throwOnError();
  await admin
    .from('state_registry_entity')
    .delete()
    .eq('state', 'NY')
    .in('entity_number', NY_ENTITIES)
    .throwOnError();
  await admin
    .from('state_registry_entity')
    .delete()
    .eq('state', 'PA')
    .eq('entity_number', '0006306940')
    .throwOnError();
  await admin
    .from('lead_import')
    .delete()
    .like('filename', `%?${run}`)
    .throwOnError();
}

beforeAll(clear);
afterAll(clear);

describe('lead file loads', () => {
  it('loads PPP loans once when the import is run again, keeping a row whose date is malformed', async () => {
    const { importId, first, second } = await importTwice(
      fixtureFile({ kind: 'ppp' }, 'ppp.csv', '2024-09-30'),
    );

    const counts = {
      source: 'ppp',
      status: 'succeeded',
      as_of: '2024-09-30',
      rows_read: 3,
      rows_written: 3,
      rows_rejected: 0,
      rows_with_nulled_fields: 1,
    };
    expect(first).toEqual(counts);
    expect(second).toEqual(counts);

    const { data: loans } = await admin
      .from('ppp_loan')
      .select('loan_number, import_id, approved_on')
      .in('loan_number', PPP_LOANS)
      .order('loan_number')
      .throwOnError();
    expect(loans).toEqual([
      {
        loan_number: '9000000001',
        import_id: importId,
        approved_on: '2020-05-01',
      },
      {
        loan_number: '9000000002',
        import_id: importId,
        approved_on: '2020-06-15',
      },
      { loan_number: '9000000003', import_id: importId, approved_on: null },
    ]);
  });

  it('keeps a matched PPP loan linked to its business when the file is loaded again', async () => {
    const file = fixtureFile({ kind: 'ppp' }, 'ppp.csv', '2024-08-31');
    const importId = crypto.randomUUID();
    await startLeadImport({ importId, file });
    await loadFixture(importId, file);
    const { data: business } = await admin
      .from('public_business')
      .insert({ name: 'BRIGHTWATER COATINGS, INC.' })
      .select('id')
      .single()
      .throwOnError();
    businessIds.push(business.id);
    await admin
      .from('ppp_loan')
      .update({ business_id: business.id })
      .eq('loan_number', '9000000001')
      .throwOnError();

    await loadFixture(importId, file);

    const { data: loan } = await admin
      .from('ppp_loan')
      .select('business_id')
      .eq('loan_number', '9000000001')
      .single()
      .throwOnError();
    expect(loan.business_id).toBe(business.id);
  });

  it('skips a file whose as-of date already imported successfully, and imports a newer one', async () => {
    const file = fixtureFile({ kind: 'sba_504' }, 'sba_504.csv', '2026-03-31');
    const firstId = crypto.randomUUID();
    await startLeadImport({ importId: firstId, file });
    await loadFixture(firstId, file);

    const sameId = crypto.randomUUID();
    const same = await startLeadImport({ importId: sameId, file });
    const newerId = crypto.randomUUID();
    const newer = await startLeadImport({
      importId: newerId,
      file: { ...file, asOf: '2026-06-30' },
    });

    expect(same).toEqual({ skipped: true });
    expect((await readRun(sameId)).status).toBe('skipped');
    expect(newer).toEqual({ skipped: false });
    expect((await readRun(newerId)).status).toBe('running');
    expect(await startLeadImport({ importId: sameId, file })).toEqual({
      skipped: true,
    });
  });

  it('loads SBA 7(a) loans once, folding a repeated row into one loan', async () => {
    const { importId, second } = await importTwice(
      fixtureFile({ kind: 'sba_7a' }, 'sba_7a.csv', '2026-06-30'),
    );

    expect(second).toEqual({
      source: 'sba_7a',
      status: 'succeeded',
      as_of: '2026-06-30',
      rows_read: 3,
      rows_written: 2,
      rows_rejected: 0,
      rows_with_nulled_fields: 0,
    });

    const { data: loans } = await admin
      .from('sba_loan')
      .select('program, borrower_name')
      .eq('import_id', importId)
      .order('borrower_name')
      .throwOnError();
    expect(loans).toEqual([
      { program: 'sba_7a', borrower_name: 'Hollow Creek Construction, Inc.' },
      { program: 'sba_7a', borrower_name: 'Lantern Row Diner Corp' },
    ]);
  });

  it('loads 5500 filings once, still rejecting an EIN that is not 9 digits', async () => {
    const { importId, second } = await importTwice(
      fixtureFile({ kind: 'form_5500' }, 'form_5500.csv', '2026-09-30'),
    );

    expect(second).toEqual({
      source: 'form_5500',
      status: 'succeeded',
      as_of: '2026-09-30',
      rows_read: 2,
      rows_written: 1,
      rows_rejected: 1,
      rows_with_nulled_fields: 0,
    });

    const { data: filings } = await admin
      .from('form_5500_filing')
      .select('ack_id, ein, participant_count, import_id')
      .in('ack_id', ACK_IDS)
      .throwOnError();
    expect(filings).toEqual([
      {
        ack_id: ACK_IDS[0],
        ein: '261640968',
        participant_count: 41,
        import_id: importId,
      },
    ]);
  });

  it('loads registry entities and their officers once when the import is run again', async () => {
    const { importId, second } = await importTwice(
      fixtureFile(
        { kind: 'state_registry', state: 'NY' },
        'registry_ny.csv',
        '2026-10-25',
      ),
    );

    expect(second).toEqual({
      source: 'state_registry',
      status: 'succeeded',
      as_of: '2026-10-25',
      rows_read: 3,
      rows_written: 2,
      rows_rejected: 1,
      rows_with_nulled_fields: 0,
    });

    const { data: entities } = await admin
      .from('state_registry_entity')
      .select(
        'entity_number, source, fetched_at, import_id, state_registry_officer(name, title)',
      )
      .eq('state', 'NY')
      .in('entity_number', NY_ENTITIES)
      .order('entity_number')
      .throwOnError();
    expect(entities).toEqual([
      {
        entity_number: '9072354',
        source: 'bulk_file',
        fetched_at: '2026-10-25T00:00:00+00:00',
        import_id: importId,
        state_registry_officer: [],
      },
      {
        entity_number: '9424185',
        source: 'bulk_file',
        fetched_at: '2026-10-25T00:00:00+00:00',
        import_id: importId,
        state_registry_officer: [{ name: 'DANA FICTIONAL', title: 'CEO' }],
      },
    ]);
  });

  it('gathers every officer row of one registry entity under that entity', async () => {
    const { second } = await importTwice(
      fixtureFile(
        { kind: 'state_registry', state: 'PA' },
        'registry_pa.csv',
        '2026-10-06',
      ),
    );

    expect(second).toMatchObject({
      rows_read: 2,
      rows_written: 1,
      rows_rejected: 0,
    });

    const { data: entity } = await admin
      .from('state_registry_entity')
      .select('name, state_registry_officer(name, title)')
      .eq('state', 'PA')
      .eq('entity_number', '0006306940')
      .single()
      .throwOnError();
    expect(entity.name).toBe('Laurel Creek Machining Inc');
    expect(entity.state_registry_officer).toEqual(
      expect.arrayContaining([
        { name: 'Avery Fictional', title: 'President' },
        { name: 'Jordan J Example', title: 'Secretary' },
      ]),
    );
    expect(entity.state_registry_officer).toHaveLength(2);
  });

  it('reports progress after each batch it writes', async () => {
    const file = fixtureFile({ kind: 'ppp' }, 'ppp.csv', '2024-07-31');
    const importId = crypto.randomUUID();
    await startLeadImport({ importId, file });
    let beats = 0;

    await loadLeadFile(
      importId,
      file,
      createReadStream(new URL('./fixtures/ppp.csv', import.meta.url)),
      () => {
        beats += 1;
      },
    );

    expect(beats).toBe(1);
  });

  it('records why an import failed', async () => {
    const importId = crypto.randomUUID();
    await startLeadImport({
      importId,
      file: fixtureFile({ kind: 'ppp' }, 'ppp.csv', '2024-06-30'),
    });

    await failLeadImport({
      importId,
      reason: 'GET https://sba.test/ppp.csv answered 503',
    });

    const { data } = await admin
      .from('lead_import')
      .select('status, error')
      .eq('id', importId)
      .single()
      .throwOnError();
    expect(data).toEqual({
      status: 'failed',
      error: 'GET https://sba.test/ppp.csv answered 503',
    });
  });

  it('fails a file that lacks a column it reads, before writing any row', async () => {
    const file = fixtureFile(
      { kind: 'ppp' },
      'ppp_missing_column.csv',
      '2024-05-31',
    );
    const importId = crypto.randomUUID();
    await startLeadImport({ importId, file });
    await admin
      .from('ppp_loan')
      .delete()
      .in('loan_number', PPP_LOANS)
      .throwOnError();

    await expect(loadFixture(importId, file)).rejects.toThrow(
      'Missing column DateApproved',
    );

    const { data: loans } = await admin
      .from('ppp_loan')
      .select('loan_number')
      .in('loan_number', PPP_LOANS)
      .throwOnError();
    expect(loans).toEqual([]);
  });

  it('imports a file again when its as-of date matches an older import but not the latest one', async () => {
    const march = fixtureFile({ kind: 'sba_504' }, 'sba_504.csv', '2026-03-31');
    const june = { ...march, asOf: '2026-06-30' };
    for (const file of [march, june]) {
      const importId = crypto.randomUUID();
      await startLeadImport({ importId, file });
      await loadFixture(importId, file);
    }

    expect(
      await startLeadImport({ importId: crypto.randomUUID(), file: march }),
    ).toEqual({ skipped: false });
  });
});
