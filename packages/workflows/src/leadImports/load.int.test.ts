import { createClient } from '@supabase/supabase-js';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import '../../test-support/integration-harness';
import { failLeadImport, skipLeadImport, startLeadImport } from './activities';
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
  ref: { kind: LeadFile['kind']; dataset?: string },
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

const OR_ENTITIES = ['100001', '200002', '300003', '400004', '500005'];
const CT_ENTITIES = ['1000001', '1000002', '1000003', '1000004', '1000005'];
const IA_ENTITIES = ['600101', '600102', '600103', '600104', '600105'];
const TX_ENTITIES = [
  '0800000101',
  '0800000102',
  '0800000103',
  '0800000104',
  '0800000105',
];

const businessIds: string[] = [];

async function importOnce(file: LeadFile) {
  const importId = crypto.randomUUID();
  await startLeadImport({ importId, file });
  await loadFixture(importId, file);
  return importId;
}

async function oregonEntities() {
  const { data } = await admin
    .from('state_registry_entity')
    .select(
      'entity_number, status, registered_agent, mailing_address_line1, mailing_postal_code, state_registry_officer(name, title)',
    )
    .eq('state', 'OR')
    .in('entity_number', OR_ENTITIES)
    .order('entity_number')
    .throwOnError();
  return data;
}

async function unmatched(importId: string) {
  const { data } = await admin
    .from('lead_import')
    .select('rows_unmatched')
    .eq('id', importId)
    .single()
    .throwOnError();
  return data.rows_unmatched;
}

async function importSnapshot(dataset: string, fixture: string, asOf: string) {
  const file: LeadFile = {
    kind: 'state_registry',
    dataset,
    url: `fixture://${dataset}-snapshot?${run}`,
    asOf,
  };
  const importId = crypto.randomUUID();
  await startLeadImport({ importId, file });
  for (const _attempt of [1, 2]) {
    await loadLeadFile(
      importId,
      file,
      createReadStream(new URL(`./fixtures/${fixture}`, import.meta.url)),
      () => {},
    );
  }
}

const oregon = (fixture: string, asOf: string) =>
  fixtureFile({ kind: 'state_registry', dataset: 'OR' }, fixture, asOf);

async function statuses(state: string, entityNumbers: string[]) {
  const { data } = await admin
    .from('state_registry_entity')
    .select('entity_number, status')
    .eq('state', state)
    .in('entity_number', entityNumbers)
    .order('entity_number')
    .throwOnError();
  return data.map(({ entity_number, status }) => [entity_number, status]);
}

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
    .from('state_registry_entity')
    .delete()
    .eq('state', 'OR')
    .in('entity_number', OR_ENTITIES)
    .throwOnError();
  await admin
    .from('state_registry_entity')
    .delete()
    .eq('state', 'CT')
    .in('entity_number', CT_ENTITIES)
    .throwOnError();
  await admin
    .from('state_registry_entity')
    .delete()
    .eq('state', 'IA')
    .in('entity_number', IA_ENTITIES)
    .throwOnError();
  await admin
    .from('state_registry_entity')
    .delete()
    .eq('state', 'TX')
    .in('entity_number', TX_ENTITIES)
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
        { kind: 'state_registry', dataset: 'NY' },
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
        { kind: 'state_registry', dataset: 'PA' },
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

  it('removes a registry officer the newer file no longer lists for that entity', async () => {
    const pa = (fixture: string) =>
      fixtureFile(
        { kind: 'state_registry', dataset: 'PA' },
        fixture,
        '2026-10-13',
      );
    await importOnce(pa('registry_pa.csv'));

    await importTwice(pa('registry_pa_departed.csv'));

    const { data: entity } = await admin
      .from('state_registry_entity')
      .select('state_registry_officer(name, title)')
      .eq('state', 'PA')
      .eq('entity_number', '0006306940')
      .single()
      .throwOnError();
    expect(entity.state_registry_officer).toEqual([
      { name: 'Avery Fictional', title: 'President' },
    ]);
  });

  it('replaces a New York CEO the newer file no longer lists', async () => {
    const ny = (fixture: string) =>
      fixtureFile(
        { kind: 'state_registry', dataset: 'NY' },
        fixture,
        '2026-10-30',
      );
    await importOnce(ny('registry_ny.csv'));

    await importTwice(ny('registry_ny_new_ceo.csv'));

    const { data: entity } = await admin
      .from('state_registry_entity')
      .select('state_registry_officer(name, title)')
      .eq('state', 'NY')
      .eq('entity_number', '9424185')
      .single()
      .throwOnError();
    expect(entity.state_registry_officer).toEqual([
      { name: 'ROBIN EXAMPLE', title: 'CEO' },
    ]);
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

  it('records why a file was skipped', async () => {
    const importId = crypto.randomUUID();
    const file = fixtureFile(
      { kind: 'state_registry', dataset: 'CT principals' },
      'registry_ct_principals.csv',
      '2026-10-27',
    );

    await skipLeadImport({
      importId,
      file,
      reason: 'CT did not load in this run',
    });

    const { data } = await admin
      .from('lead_import')
      .select('source, filename, as_of, status, error')
      .eq('id', importId)
      .single()
      .throwOnError();
    expect(data).toEqual({
      source: 'state_registry',
      filename: file.url,
      as_of: '2026-10-27',
      status: 'skipped',
      error: 'CT did not load in this run',
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

  it('gathers each Oregon business from its rows, taking the principal place of business and the registered agent whichever comes first', async () => {
    const { second } = await importTwice(
      oregon('registry_or.csv', '2026-10-18'),
    );

    expect(second).toMatchObject({
      rows_read: 6,
      rows_written: 2,
      rows_rejected: 0,
    });
    expect(await oregonEntities()).toEqual([
      {
        entity_number: '100001',
        status: 'active',
        registered_agent: 'CASEY Q FICTIONAL',
        mailing_address_line1: '12 SAMPLE LN',
        mailing_postal_code: '97702',
        state_registry_officer: [],
      },
      {
        entity_number: '200002',
        status: 'active',
        registered_agent: 'SAMPLE REGISTERED AGENTS INC',
        mailing_address_line1: '40 SAMPLE ST',
        mailing_postal_code: '97401',
        state_registry_officer: [],
      },
    ]);
  });

  it('attaches Oregon officers, people or companies, to businesses already listed, creating none and counting the rest', async () => {
    await importOnce(oregon('registry_or.csv', '2026-10-18'));

    const { importId } = await importTwice(
      fixtureFile(
        { kind: 'state_registry', dataset: 'OR officers' },
        'registry_or_officers.csv',
        '2026-10-01',
      ),
    );

    const entities = await oregonEntities();
    expect(entities.map((entity) => entity.entity_number)).toEqual([
      '100001',
      '200002',
    ]);
    expect(entities[0]!.state_registry_officer).toEqual(
      expect.arrayContaining([
        { name: 'CASEY Q FICTIONAL', title: 'MEMBER' },
        { name: 'RILEY EXAMPLE JR', title: 'MANAGER' },
        { name: 'SAMPLE ORCHARD HOLDINGS LLC', title: 'MEMBER' },
      ]),
    );
    expect(entities[0]!.state_registry_officer).toHaveLength(5);
    expect(await unmatched(importId)).toBe(2);

    await importTwice(
      fixtureFile(
        { kind: 'state_registry', dataset: 'OR officers' },
        'registry_or_officers_departed.csv',
        '2026-11-01',
      ),
    );

    expect(
      (await oregonEntities())[0]!.state_registry_officer.map(
        (officer) => officer.name,
      ),
    ).toEqual(expect.not.arrayContaining(['RILEY EXAMPLE JR']));
    expect((await oregonEntities())[0]!.state_registry_officer).toHaveLength(4);

    await importTwice(
      fixtureFile(
        { kind: 'state_registry', dataset: 'OR officers' },
        'registry_or_officers_listed_only.csv',
        '2026-12-01',
      ),
    );

    expect((await oregonEntities())[0]!.state_registry_officer).toEqual([]);
  });

  it('marks an Oregon business missing from the latest file as no longer listed, clears the agent the later file leaves blank, keeps authorized representatives as officers while listed, and restores it when it is listed again', async () => {
    await importSnapshot('OR', 'registry_or.csv', '2026-10-18');

    await importSnapshot('OR', 'registry_or_relisted.csv', '2026-10-25');

    expect(
      (await oregonEntities()).map(
        ({ entity_number, status, registered_agent }) => [
          entity_number,
          status,
          registered_agent,
        ],
      ),
    ).toEqual([
      ['100001', 'active', null],
      ['200002', 'inactive (no longer listed)', 'SAMPLE REGISTERED AGENTS INC'],
    ]);
    expect(
      (await oregonEntities())[0]!.state_registry_officer.toSorted((a, b) =>
        a.name.localeCompare(b.name),
      ),
    ).toEqual([
      { name: 'PAT SAMPLE', title: 'AUTHORIZED REPRESENTATIVE' },
      { name: 'ROBIN EXAMPLE', title: 'AUTHORIZED REPRESENTATIVE' },
    ]);

    await importSnapshot('OR', 'registry_or.csv', '2026-11-01');

    expect(
      (await oregonEntities()).map(
        ({ entity_number, status, state_registry_officer }) => [
          entity_number,
          status,
          state_registry_officer,
        ],
      ),
    ).toEqual([
      ['100001', 'active', []],
      ['200002', 'active', []],
    ]);
  });

  it('marks no Oregon drop-outs, and warns, when the file has under 80% of the rows of the last good one', async () => {
    await importSnapshot('OR', 'registry_or.csv', '2026-11-08');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await importSnapshot('OR', 'registry_or_truncated.csv', '2026-11-15');

    expect(
      (await oregonEntities()).map(({ entity_number, status }) => [
        entity_number,
        status,
      ]),
    ).toEqual([
      ['100001', 'active'],
      ['200002', 'active'],
    ]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('skipped marking OR drop-outs'),
    );
    warn.mockRestore();
  });

  it('marks no drop-outs on the first import of an Oregon file', async () => {
    await importOnce(oregon('registry_or.csv', '2026-11-22'));
    await importOnce(oregon('registry_or_relisted.csv', '2026-11-29'));

    expect(
      (await oregonEntities()).map(({ entity_number, status }) => [
        entity_number,
        status,
      ]),
    ).toEqual([
      ['100001', 'active'],
      ['200002', 'active'],
    ]);
  });

  it('attaches Connecticut principals and the registered agent through the business Id', async () => {
    const ct = (dataset: string, fixture: string) =>
      fixtureFile({ kind: 'state_registry', dataset }, fixture, '2026-10-27');
    await importOnce(ct('CT', 'registry_ct.csv'));

    const principals = await importTwice(
      ct('CT principals', 'registry_ct_principals.csv'),
    );
    await importTwice(ct('CT agents', 'registry_ct_agents.csv'));

    const { data: entity } = await admin
      .from('state_registry_entity')
      .select('registered_agent, state_registry_officer(name, title)')
      .eq('state', 'CT')
      .eq('entity_number', '1000001')
      .single()
      .throwOnError();
    expect(entity.registered_agent).toBe('Sample Agent Services LLC');
    expect(entity.state_registry_officer).toEqual(
      expect.arrayContaining([
        { name: 'Morgan Example', title: 'Principal' },
        { name: 'Quinn Fictional', title: 'Officer' },
        { name: 'Quinn Fictional', title: 'Director' },
      ]),
    );
    expect(entity.state_registry_officer).toHaveLength(3);
    expect(await unmatched(principals.importId)).toBe(1);

    await importOnce(
      fixtureFile(
        { kind: 'state_registry', dataset: 'CT' },
        'registry_ct.csv',
        '2026-11-03',
      ),
    );
    await importTwice(
      fixtureFile(
        { kind: 'state_registry', dataset: 'CT principals' },
        'registry_ct_principals_departed.csv',
        '2026-11-03',
      ),
    );

    const { data: later } = await admin
      .from('state_registry_entity')
      .select('registered_agent, state_registry_officer(name, title)')
      .eq('state', 'CT')
      .eq('entity_number', '1000001')
      .single()
      .throwOnError();
    expect(later).toEqual({
      registered_agent: 'Sample Agent Services LLC',
      state_registry_officer: [{ name: 'Morgan Example', title: 'Principal' }],
    });
  });

  it('keeps the registered agent when a later row of the same business in an agents file has none', async () => {
    const ct = (dataset: string, fixture: string) =>
      fixtureFile({ kind: 'state_registry', dataset }, fixture, '2026-11-10');
    await importOnce(ct('CT', 'registry_ct.csv'));

    await importTwice(ct('CT agents', 'registry_ct_agents_repeat.csv'));

    const { data: entity } = await admin
      .from('state_registry_entity')
      .select('registered_agent')
      .eq('state', 'CT')
      .eq('entity_number', '1000001')
      .single()
      .throwOnError();
    expect(entity.registered_agent).toBe('Harbor Agent Co');
  });

  it('marks an Iowa business missing from a later full file as no longer listed', async () => {
    await importSnapshot('IA', 'registry_ia_full.csv', '2026-10-16');

    await importSnapshot('IA', 'registry_ia_later.csv', '2026-10-23');

    expect(await statuses('IA', IA_ENTITIES)).toEqual([
      ['600101', 'active'],
      ['600102', 'active'],
      ['600103', 'active'],
      ['600104', 'active'],
      ['600105', 'inactive (no longer listed)'],
    ]);
  });

  it('leaves a Texas business missing from a later file as its last file reported it', async () => {
    await importSnapshot('TX', 'registry_tx_full.csv', '2026-10-16');

    await importSnapshot('TX', 'registry_tx_later.csv', '2026-10-23');

    expect(await statuses('TX', TX_ENTITIES)).toEqual([
      ['0800000101', 'active'],
      ['0800000102', 'active'],
      ['0800000103', 'active'],
      ['0800000104', 'active'],
      ['0800000105', 'active'],
    ]);
  });

  it('refuses a row whose source id another row or entity already holds, counts it as rejected, and loads the rest', async () => {
    const ct = (fixture: string) =>
      fixtureFile(
        { kind: 'state_registry', dataset: 'CT' },
        fixture,
        '2026-11-17',
      );

    const duplicate = await importTwice(ct('registry_ct_duplicate_id.csv'));
    const taken = await importTwice(ct('registry_ct_taken_id.csv'));

    expect(duplicate.second).toMatchObject({
      status: 'succeeded',
      rows_read: 3,
      rows_written: 2,
      rows_rejected: 1,
    });
    expect(taken.second).toMatchObject({
      status: 'succeeded',
      rows_read: 1,
      rows_written: 0,
      rows_rejected: 1,
    });
    const { data: entities } = await admin
      .from('state_registry_entity')
      .select('entity_number, source_id')
      .eq('state', 'CT')
      .in('entity_number', CT_ENTITIES.slice(1))
      .order('entity_number')
      .throwOnError();
    expect(entities).toEqual([
      { entity_number: '1000002', source_id: '001t000000sample2' },
      { entity_number: '1000004', source_id: '001t000000sample4' },
    ]);
  });
});
