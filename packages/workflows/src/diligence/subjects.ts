import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { firstMailingAddress } from '../builder/steps/prepareFirm';
import { teamRow } from '../builder/teamRow';

type SubjectKind = 'business' | 'person';

export type DiligenceSubject = {
  key: string;
  kind: SubjectKind;
  name: string;
  sources: string[];
};

type NameSpelling = 'source_priority' | 'newest_record';

type Sighting = { name: string | null; source: string; at: string | null };

function subjectsOf(
  kind: SubjectKind,
  spelling: NameSpelling,
  sightings: Sighting[],
): DiligenceSubject[] {
  const byKey = new Map<string, DiligenceSubject & { at: number }>();
  for (const sighting of sightings) {
    const normalized = sighting.name?.trim().replace(/\s+/g, ' ').toLowerCase();
    if (!normalized) {
      continue;
    }
    const key = `${kind}:${normalized}`;
    const name = sighting.name!;
    const at = sighting.at ? Date.parse(sighting.at) : -Infinity;
    const subject = byKey.get(key);
    if (!subject) {
      byKey.set(key, { key, kind, name, sources: [sighting.source], at });
      continue;
    }
    if (spelling === 'newest_record' && at > subject.at) {
      subject.name = name;
      subject.at = at;
    }
    if (!subject.sources.includes(sighting.source)) {
      subject.sources.push(sighting.source);
    }
  }
  return [...byKey.values()].map(({ at: _at, ...subject }) => subject);
}

const newestFirst = { ascending: false, nullsFirst: false };

const addressFields = 'address_line1, city, state, postal_code';

async function publicRecords(businessId: string) {
  const admin = getSupabaseServerAdminClient();
  const [
    { data: business },
    { data: ppp },
    { data: sba },
    { data: form5500 },
    { data: registries },
  ] = await Promise.all([
    admin
      .from('public_business')
      .select('name, created_at')
      .eq('id', businessId)
      .single()
      .throwOnError(),
    admin
      .from('ppp_loan')
      .select(`borrower_name, approved_on, ${addressFields}`)
      .eq('business_id', businessId)
      .order('approved_on', newestFirst)
      .throwOnError(),
    admin
      .from('sba_loan')
      .select(`borrower_name, approved_on, ${addressFields}`)
      .eq('business_id', businessId)
      .order('approved_on', newestFirst)
      .throwOnError(),
    admin
      .from('form_5500_filing')
      .select(`sponsor_name, plan_year_begin, ${addressFields}`)
      .eq('business_id', businessId)
      .order('plan_year_begin', newestFirst)
      .throwOnError(),
    admin
      .from('state_registry_entity')
      .select(
        'name, fetched_at, mailing_address_line1, mailing_city, mailing_state, mailing_postal_code, state_registry_officer (name)',
      )
      .eq('business_id', businessId)
      .order('fetched_at', newestFirst)
      .throwOnError(),
  ]);
  return {
    state:
      firstMailingAddress({ registries, ppp, sba, form5500 })?.state ?? null,
    businesses: [
      {
        name: business.name,
        source: 'public_business',
        at: business.created_at,
      },
      ...ppp.map((loan) => ({
        name: loan.borrower_name,
        source: 'ppp_loan',
        at: loan.approved_on,
      })),
      ...sba.map((loan) => ({
        name: loan.borrower_name,
        source: 'sba_loan',
        at: loan.approved_on,
      })),
      ...form5500.map((filing) => ({
        name: filing.sponsor_name,
        source: 'form_5500_filing',
        at: filing.plan_year_begin,
      })),
      ...registries.map((entity) => ({
        name: entity.name,
        source: 'state_registry_entity',
        at: entity.fetched_at,
      })),
    ],
    officers: registries.flatMap((entity) =>
      entity.state_registry_officer.map((officer) => ({
        name: officer.name,
        source: 'state_registry_officer',
        at: entity.fetched_at,
      })),
    ),
  };
}

export async function diligenceSubjects(accountId: string, dealId: string) {
  const admin = getSupabaseServerAdminClient();
  const deal = await teamRow(dealId, 'That deal is not on this team', (id) =>
    admin
      .from('deal')
      .select(
        'account:account_id (diligence_name_spelling), firm:firm_id (id, name, state, public_business_id, owner_names, updated_at)',
      )
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle()
      .throwOnError(),
  );
  const firm = deal.firm!;
  const spelling: NameSpelling = deal.account.diligence_name_spelling;
  const [{ data: principals }, records] = await Promise.all([
    admin
      .from('deal_contact')
      .select('created_at, contact (name)')
      .eq('deal_id', dealId)
      .eq('side', 'seller')
      .eq('role', 'principal')
      .order('created_at', newestFirst)
      .throwOnError(),
    firm.public_business_id
      ? publicRecords(firm.public_business_id)
      : { state: null, businesses: [], officers: [] },
  ]);

  return {
    dealId,
    firmId: firm.id,
    state: firm.state?.toUpperCase() ?? records.state,
    subjects: [
      ...subjectsOf('business', spelling, [
        { name: firm.name, source: 'firm', at: firm.updated_at },
        ...records.businesses,
      ]),
      ...subjectsOf('person', spelling, [
        ...principals.map(({ contact, created_at }) => ({
          name: contact.name,
          source: 'deal_contact',
          at: created_at,
        })),
        ...records.officers,
        ...firm.owner_names.map((name) => ({
          name,
          source: 'firm',
          at: firm.updated_at,
        })),
      ]),
    ],
  };
}
