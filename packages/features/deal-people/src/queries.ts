import 'server-only';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { dealPeopleSchema, dealSides } from './schema';

export type DealRoster = Awaited<ReturnType<typeof loadDealPeople>>;
type DealPerson = DealRoster['people'][number];
export type DealPersonEntry = DealPerson['entries'][number];
export type AddressBookContact = DealRoster['addressBook'][number];

function standing(person: DealPerson) {
  return Math.min(
    ...person.entries.map(
      (entry) => dealSides.indexOf(entry.side) * 2 + (entry.is_main ? 0 : 1),
    ),
  );
}

export async function loadDealPeople({
  dealId,
  accountId,
}: {
  dealId: string;
  accountId: string;
}) {
  const client = getSupabaseServerClient();
  const [
    { data: rows },
    { data: canEdit },
    { data: contacts },
    { data: memberships },
  ] = await Promise.all([
    client.rpc('deal_people', { deal_id: dealId }).throwOnError(),
    client
      .rpc('manages_deal_in_account', {
        deal_id: dealId,
        account_id: accountId,
      })
      .throwOnError(),
    client
      .from('contact')
      .select('id, name, email, company')
      .eq('account_id', accountId)
      .order('name')
      .throwOnError(),
    client
      .from('accounts_memberships')
      .select('user_id, account_role')
      .eq('account_id', accountId)
      .throwOnError(),
  ]);
  const teamRoles = new Map(
    memberships.map((member) => [member.user_id, member.account_role]),
  );
  const people = dealPeopleSchema
    .parse(rows)
    .map((person) => ({
      ...person,
      entries: person.entries.map((entry) =>
        entry.source === 'team'
          ? { ...entry, role: teamRoles.get(entry.user_id)! }
          : entry,
      ),
    }))
    .sort((a, b) => standing(a) - standing(b) || a.name.localeCompare(b.name));
  const onDeal = new Set(
    people.flatMap((person) => person.entries.map((entry) => entry.contact_id)),
  );

  return {
    people,
    canEdit,
    addressBook: contacts.filter((contact) => !onDeal.has(contact.id)),
  };
}
