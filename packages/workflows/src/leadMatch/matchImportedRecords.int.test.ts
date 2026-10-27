import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  provisionAccount,
  type IntegrationAccount,
} from '../../test-support/integration-harness';
import { matchImportedRecords } from './matchImportedRecords';

let pipelineTeam: IntegrationAccount;
let otherTeam: IntegrationAccount;
let einTeam: IntegrationAccount;
let importId: string;
let otherImportId: string;
let bulkMatch: Promise<unknown> = Promise.resolve();

const postal = String(10000 + Math.floor(Math.random() * 89999));
const runTag = crypto.randomUUID().slice(0, 8);
const einOf = (n: number) => String(100000000 + Math.floor(Math.random() * 800000000) + n).slice(0, 9);
const knownEin = einOf(1);
const unknownEin = einOf(2);
const strongEin = einOf(3);
const weakEin = einOf(4);
const lonelyEin = einOf(5);
const heldEin = einOf(6);
const clashEin = einOf(7);
const loneHeldEin = einOf(8);
const loneClashEin = einOf(9);
let acmeId: string;
let dentalId: string;
let filedId: string;

async function newImport(admin: IntegrationAccount['admin'], source: string) {
  const { data } = await admin
    .from('lead_import')
    .insert({ source, filename: `match-${runTag}.csv` })
    .select('id')
    .single()
    .throwOnError();
  return data.id as string;
}

async function newBusiness(admin: IntegrationAccount['admin'], row: Record<string, string>) {
  const { data } = await admin.from('public_business').insert(row).select('id').single().throwOnError();
  return data.id as string;
}

async function pppLink(loanNumber: string) {
  const { data } = await pipelineTeam.admin
    .from('ppp_loan')
    .select('business_id')
    .eq('loan_number', loanNumber)
    .single()
    .throwOnError();
  return data.business_id as string | null;
}

async function businessesInBlock() {
  const { data } = await pipelineTeam.admin
    .from('public_business')
    .select('id, name, match_key')
    .like('match_key', `${postal}|%`)
    .order('match_key')
    .throwOnError();
  return data;
}

async function reviews() {
  const { data } = await pipelineTeam.admin
    .from('business_match_review')
    .select('account_id, business_id, ppp_loan_number, status')
    .like('ppp_loan_number', `${runTag}%`)
    .order('ppp_loan_number')
    .throwOnError();
  return data;
}

function loan(suffix: string, borrowerName: string, addressLine1: string | null, importRef = importId) {
  return {
    loan_number: `${runTag}-${suffix}`,
    import_id: importRef,
    borrower_name: borrowerName,
    address_line1: addressLine1,
    postal_code: postal,
  };
}

beforeAll(async () => {
  pipelineTeam = await provisionAccount();
  otherTeam = await provisionAccount();
  einTeam = await provisionAccount();
  const { admin } = pipelineTeam;

  acmeId = await newBusiness(admin, { name: 'Acme Plumbing LLC', match_key: `${postal}|12|acme plumbing` });
  dentalId = await newBusiness(admin, { name: 'Lakeside Dental Care', match_key: `${postal}|40|lakeside dental care` });
  filedId = await newBusiness(admin, { name: 'Harrow Freightworks Partners', ein: knownEin });

  await admin
    .from('firm')
    .insert({ account_id: pipelineTeam.accountId, name: 'Acme Plumbing', public_business_id: acmeId })
    .throwOnError();

  importId = await newImport(admin, 'ppp');
  otherImportId = await newImport(admin, 'ppp');

  await admin
    .from('ppp_loan')
    .insert([
      loan('exact', 'ACME PLUMBING, L.L.C.', '12 Congress Ave'),
      loan('typo', 'Lakeside Dentl Care Inc', '40 Shore Rd'),
      loan('weak', 'Acme Plumbing and Heating', '12 Congress Ave Ste 2'),
      loan('new', 'Golden Dragon Restaurant', '12 Congress Ave'),
      loan('unheld', 'Lakeside Dental Care and Ortho', '40 Shore Rd'),
      loan('pobox', 'Acme Plumbing LLC', 'PO Box 9'),
      loan('elsewhere', 'Acme Plumbing LLC', '12 Congress Ave', otherImportId),
    ])
    .throwOnError();

  await matchImportedRecords({ source: 'ppp', importId });
});

afterAll(async () => {
  await Promise.allSettled([bulkMatch]);
  const { admin } = pipelineTeam;
  await admin.from('ppp_loan').delete().like('loan_number', `${runTag}%`).throwOnError();
  await admin.from('form_5500_filing').delete().like('ack_id', `${runTag}%`).throwOnError();
  await admin.from('sba_loan').delete().like('source_key', `${runTag}%`).throwOnError();
  await admin.from('state_registry_entity').delete().like('entity_number', `${runTag}%`).throwOnError();
  await admin
    .from('firm')
    .delete()
    .in('account_id', [pipelineTeam.accountId, otherTeam.accountId, einTeam.accountId])
    .throwOnError();
  await admin.from('public_business').delete().like('match_key', `${postal}|%`).throwOnError();
  await admin
    .from('business_match_review')
    .delete()
    .like('form_5500_ack_id', `${runTag}%`)
    .throwOnError();
  await admin
    .from('public_business')
    .delete()
    .in('ein', [knownEin, unknownEin, strongEin, weakEin, lonelyEin, heldEin, clashEin, loneHeldEin, loneClashEin])
    .throwOnError();
  await admin.from('lead_import').delete().like('filename', `match-${runTag}%`).throwOnError();
  await pipelineTeam.cleanup();
  await otherTeam.cleanup();
  await einTeam.cleanup();
}, 120_000);

describe('matchImportedRecords', () => {
  it('links a record whose name and address match a business exactly', async () => {
    expect(await pppLink(`${runTag}-exact`)).toBe(acmeId);
  });

  it('links a record whose name is a strong fuzzy match at the same address', async () => {
    expect(await pppLink(`${runTag}-typo`)).toBe(dentalId);
  });

  it('creates a business for a record that matches nothing and links it', async () => {
    const created = (await businessesInBlock()).find((b) => b.match_key === `${postal}|12|golden dragon restaurant`);
    expect(created?.name).toBe('Golden Dragon Restaurant');
    expect(await pppLink(`${runTag}-new`)).toBe(created?.id);
  });

  it('leaves a weak match unlinked and sends it to the review list of each team whose firms hold the candidate', async () => {
    expect(await pppLink(`${runTag}-weak`)).toBeNull();
    expect(await reviews()).toEqual([
      {
        account_id: pipelineTeam.accountId,
        business_id: acmeId,
        ppp_loan_number: `${runTag}-weak`,
        status: 'pending',
      },
    ]);
  });

  it('gives a weak match no team reviews its own business and links it', async () => {
    const own = (await businessesInBlock()).find((b) => b.match_key === `${postal}|40|lakeside dental care and ortho`);
    expect(own?.name).toBe('Lakeside Dental Care and Ortho');
    expect(await pppLink(`${runTag}-unheld`)).toBe(own?.id);
    expect((await reviews()).map((r) => r.ppp_loan_number)).not.toContain(`${runTag}-unheld`);
  });

  it('leaves a record without a street number unlinked and creates nothing for it', async () => {
    expect(await pppLink(`${runTag}-pobox`)).toBeNull();
  });

  it('touches only the records of the given import', async () => {
    expect(await pppLink(`${runTag}-elsewhere`)).toBeNull();
  });

  it('converges to the same links, businesses and reviews when run again', async () => {
    const before = { businesses: await businessesInBlock(), reviews: await reviews() };

    await matchImportedRecords({ source: 'ppp', importId });

    expect({ businesses: await businessesInBlock(), reviews: await reviews() }).toEqual(before);
    expect(await pppLink(`${runTag}-new`)).toBe(before.businesses.find((b) => b.name === 'Golden Dragon Restaurant')?.id);
  });

  it('keeps a team decision when the import is matched again', async () => {
    await pipelineTeam.admin
      .from('business_match_review')
      .update({ status: 'rejected', reviewed_by: pipelineTeam.userId, reviewed_at: new Date().toISOString() })
      .eq('ppp_loan_number', `${runTag}-weak`)
      .throwOnError();

    await matchImportedRecords({ source: 'ppp', importId });

    expect((await reviews()).map((r) => r.status)).toEqual(['rejected']);
  });

  it('links a filing by EIN, and creates a business carrying an EIN no business has', async () => {
    const { admin } = pipelineTeam;
    const filingImport = await newImport(admin, 'form_5500');
    await admin
      .from('form_5500_filing')
      .insert([
        { ack_id: `${runTag}-known`, import_id: filingImport, ein: knownEin, sponsor_name: 'Harrow Freightworks Partners LP' },
        { ack_id: `${runTag}-unknown`, import_id: filingImport, ein: unknownEin, sponsor_name: 'Quarry Tile Works' },
      ])
      .throwOnError();

    await matchImportedRecords({ source: 'form_5500', importId: filingImport });

    const { data: filings } = await admin
      .from('form_5500_filing')
      .select('ack_id, business_id, public_business(name, ein)')
      .like('ack_id', `${runTag}%`)
      .order('ack_id')
      .throwOnError();
    expect(filings).toEqual([
      {
        ack_id: `${runTag}-known`,
        business_id: filedId,
        public_business: { name: 'Harrow Freightworks Partners', ein: knownEin },
      },
      {
        ack_id: `${runTag}-unknown`,
        business_id: expect.any(String),
        public_business: { name: 'Quarry Tile Works', ein: unknownEin },
      },
    ]);
  });

  it('falls back to name and address when no business has the EIN', async () => {
    const { admin } = pipelineTeam;
    const filingImport = await newImport(admin, 'form_5500');
    const filing = (suffix: string, ein: string, sponsorName: string, addressLine1: string) => ({
      ack_id: `${runTag}-fb-${suffix}`,
      import_id: filingImport,
      ein,
      sponsor_name: sponsorName,
      address_line1: addressLine1,
      postal_code: postal,
    });
    await admin
      .from('form_5500_filing')
      .insert([
        filing('strong', strongEin, 'Lakeside Dental Care PC', '40 Shore Rd'),
        filing('weak', weakEin, 'Acme Plumbing and Heating Inc', '12 Congress Ave'),
        filing('lonely', lonelyEin, 'Quarry Tile Works', '77 Stone Ln'),
      ])
      .throwOnError();

    await matchImportedRecords({ source: 'form_5500', importId: filingImport });

    const { data: filings } = await admin
      .from('form_5500_filing')
      .select('ack_id, business_id')
      .like('ack_id', `${runTag}-fb-%`)
      .order('ack_id')
      .throwOnError();
    const linkOf = Object.fromEntries(filings.map((f) => [f.ack_id, f.business_id]));
    const { data: dental } = await admin
      .from('public_business')
      .select('ein')
      .eq('id', dentalId)
      .single()
      .throwOnError();
    const { data: lonely } = await admin
      .from('public_business')
      .select('name, ein, match_key')
      .eq('ein', lonelyEin)
      .single()
      .throwOnError();
    const { data: weakReviews } = await admin
      .from('business_match_review')
      .select('account_id, business_id')
      .eq('form_5500_ack_id', `${runTag}-fb-weak`)
      .throwOnError();
    const { count: weakEinBusinesses } = await admin
      .from('public_business')
      .select('id', { count: 'exact', head: true })
      .eq('ein', weakEin)
      .throwOnError();

    expect({ linkOf, dental, lonely, weakReviews, weakEinBusinesses }).toEqual({
      linkOf: {
        [`${runTag}-fb-lonely`]: expect.any(String),
        [`${runTag}-fb-strong`]: dentalId,
        [`${runTag}-fb-weak`]: null,
      },
      dental: { ein: strongEin },
      lonely: { name: 'Quarry Tile Works', ein: lonelyEin, match_key: `${postal}|77|quarry tile works` },
      weakReviews: [{ account_id: pipelineTeam.accountId, business_id: acmeId }],
      weakEinBusinesses: 0,
    });
  });

  it('reviews a strong name and address match whose business holds a different EIN as an EIN conflict, once per team holding the business or either EIN', async () => {
    const { admin } = pipelineTeam;
    const clashId = await newBusiness(admin, {
      name: 'Pine Ridge Roofing LLC',
      ein: heldEin,
      match_key: `${postal}|88|pine ridge roofing`,
    });
    await admin
      .from('firm')
      .insert([
        { account_id: pipelineTeam.accountId, name: 'Pine Ridge Roofing', public_business_id: clashId },
        { account_id: pipelineTeam.accountId, name: 'Pine Ridge Roofing (filing)', ein: clashEin },
        { account_id: otherTeam.accountId, name: 'Pine Ridge Roofing', ein: clashEin },
        { account_id: einTeam.accountId, name: 'Pine Ridge Roofing', ein: heldEin },
      ])
      .throwOnError();
    const filingImport = await newImport(admin, 'form_5500');
    await admin
      .from('form_5500_filing')
      .insert({
        ack_id: `${runTag}-clash`,
        import_id: filingImport,
        ein: clashEin,
        sponsor_name: 'Pine Ridge Roofing Inc',
        address_line1: '88 Timber Way',
        postal_code: postal,
      })
      .throwOnError();

    await matchImportedRecords({ source: 'form_5500', importId: filingImport });

    const { data: filing } = await admin
      .from('form_5500_filing')
      .select('business_id')
      .eq('ack_id', `${runTag}-clash`)
      .single()
      .throwOnError();
    const { data: clash } = await admin.from('public_business').select('ein').eq('id', clashId).single().throwOnError();
    const { data: clashReviews } = await admin
      .from('business_match_review')
      .select('account_id, business_id, score, reason, status')
      .eq('form_5500_ack_id', `${runTag}-clash`)
      .throwOnError();

    const review = (accountId: string) => ({
      account_id: accountId,
      business_id: clashId,
      score: 1,
      reason: 'ein_conflict',
      status: 'pending',
    });
    expect({ filing, clash, clashReviews: clashReviews.sort((a, b) => a.account_id.localeCompare(b.account_id)) }).toEqual({
      filing: { business_id: null },
      clash: { ein: heldEin },
      clashReviews: [pipelineTeam.accountId, otherTeam.accountId, einTeam.accountId]
        .sort()
        .map(review),
    });
  });

  it('gives an EIN conflict no team reviews its own business carrying its EIN and links it', async () => {
    const { admin } = pipelineTeam;
    const heldId = await newBusiness(admin, {
      name: 'Birch Hollow Kennels LLC',
      ein: loneHeldEin,
      match_key: `${postal}|91|birch hollow kennels`,
    });
    const filingImport = await newImport(admin, 'form_5500');
    await admin
      .from('form_5500_filing')
      .insert({
        ack_id: `${runTag}-lone-clash`,
        import_id: filingImport,
        ein: loneClashEin,
        sponsor_name: 'Birch Hollow Kennels Inc',
        address_line1: '91 Birch Rd',
        postal_code: postal,
      })
      .throwOnError();

    await matchImportedRecords({ source: 'form_5500', importId: filingImport });

    const { data: filing } = await admin
      .from('form_5500_filing')
      .select('business_id, public_business(name, ein, match_key)')
      .eq('ack_id', `${runTag}-lone-clash`)
      .single()
      .throwOnError();
    const { data: held } = await admin.from('public_business').select('ein').eq('id', heldId).single().throwOnError();
    const { count: reviewCount } = await admin
      .from('business_match_review')
      .select('id', { count: 'exact', head: true })
      .eq('form_5500_ack_id', `${runTag}-lone-clash`)
      .throwOnError();

    expect({ filing, held, reviewCount }).toEqual({
      filing: {
        business_id: expect.not.stringMatching(heldId),
        public_business: { name: 'Birch Hollow Kennels Inc', ein: loneClashEin, match_key: null },
      },
      held: { ein: loneHeldEin },
      reviewCount: 0,
    });
  });

  it('sends a weak match to teams whose firm holds the candidate business EIN', async () => {
    const { admin } = pipelineTeam;
    await admin.from('firm').insert({ account_id: einTeam.accountId, name: 'Pine Ridge', ein: heldEin }).throwOnError();
    const loanImport = await newImport(admin, 'ppp');
    await admin
      .from('ppp_loan')
      .insert(loan('pine-weak', 'Pine Ridge Roofing and Gutters', '88 Timber Way', loanImport))
      .throwOnError();

    await matchImportedRecords({ source: 'ppp', importId: loanImport });

    const { data } = await admin
      .from('business_match_review')
      .select('account_id, reason')
      .eq('ppp_loan_number', `${runTag}-pine-weak`)
      .throwOnError();
    expect(data.map((r) => r.reason)).toEqual(data.map(() => 'weak_match'));
    expect(data.map((r) => r.account_id)).toContain(einTeam.accountId);
  });

  it('matches SBA loans and registry entities, whose keys are uuids', async () => {
    const { admin } = pipelineTeam;
    const sbaImport = await newImport(admin, 'sba_7a');
    const registryImport = await newImport(admin, 'state_registry');
    await admin
      .from('sba_loan')
      .insert({
        source_key: `${runTag}-sba`,
        import_id: sbaImport,
        program: 'sba_7a',
        borrower_name: 'Acme Plumbing Inc',
        address_line1: '12 Congress Ave',
        postal_code: postal,
      })
      .throwOnError();
    await admin
      .from('state_registry_entity')
      .insert({
        state: 'TX',
        entity_number: `${runTag}-reg`,
        import_id: registryImport,
        name: 'Lakeside Dental Care, PLLC',
        mailing_address_line1: '40 Shore Rd',
        mailing_postal_code: postal,
        source: 'bulk_file',
        fetched_at: new Date().toISOString(),
      })
      .throwOnError();

    await matchImportedRecords({ source: 'sba_7a', importId: sbaImport });
    await matchImportedRecords({ source: 'state_registry', importId: registryImport });

    const { data: sba } = await admin
      .from('sba_loan')
      .select('business_id')
      .eq('source_key', `${runTag}-sba`)
      .single()
      .throwOnError();
    const { data: registry } = await admin
      .from('state_registry_entity')
      .select('business_id')
      .eq('entity_number', `${runTag}-reg`)
      .single()
      .throwOnError();
    expect({ sba, registry }).toEqual({ sba: { business_id: acmeId }, registry: { business_id: dentalId } });
  });

  it('pages through an import larger than one batch', async () => {
    const { admin } = pipelineTeam;
    const bulkImport = await newImport(admin, 'ppp');
    await admin
      .from('ppp_loan')
      .insert(
        Array.from({ length: 501 }, (_, i) =>
          loan(`bulk-${String(i).padStart(3, '0')}`, `Bulk Shop ${i}`, `${1000 + i} Market St`, bulkImport),
        ),
      )
      .throwOnError();

    bulkMatch = matchImportedRecords({ source: 'ppp', importId: bulkImport });
    await bulkMatch;

    const { count } = await admin
      .from('ppp_loan')
      .select('loan_number', { count: 'exact', head: true })
      .eq('import_id', bulkImport)
      .is('business_id', null)
      .throwOnError();
    expect(count).toBe(0);
  }, 120_000);
});
