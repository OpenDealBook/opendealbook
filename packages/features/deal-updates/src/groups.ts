import type { DealRoster } from '@odb/deal-people/queries.ts';

import type { Picks, RecipientGroup } from './schema';

export type DealPerson = DealRoster['people'][number];
type Entry = DealPerson['entries'][number];
type Standing = Partial<{
  source: Entry['source'];
  side: Entry['side'];
  role: Entry['role'];
}>;

export const RECIPIENT_GROUPS: Record<
  RecipientGroup,
  { label: string; holds: Standing[] }
> = {
  team: { label: 'Team', holds: [{ source: 'team' }] },
  lenders: { label: 'Lenders', holds: [{ source: 'lender_room' }] },
  sellers: {
    label: 'Sellers',
    holds: [
      { source: 'seller_room' },
      { source: 'contact', side: 'seller', role: 'principal' },
    ],
  },
  buyers_counsel: {
    label: "Buyer's counsel",
    holds: [
      { source: 'contact', side: 'buyer', role: 'attorney' },
      { source: 'counsel', side: 'buyer' },
    ],
  },
  sellers_counsel: {
    label: "Seller's counsel",
    holds: [
      { source: 'contact', side: 'seller', role: 'attorney' },
      { source: 'counsel', side: 'seller' },
    ],
  },
  brokers: { label: 'Brokers', holds: [{ source: 'contact', role: 'broker' }] },
};

export function belongsTo(person: DealPerson, group: RecipientGroup) {
  return person.entries.some(
    (entry) =>
      !entry.room_closed &&
      RECIPIENT_GROUPS[group].holds.some((standing) =>
        (Object.keys(standing) as (keyof Standing)[]).every(
          (key) => entry[key] === standing[key],
        ),
      ),
  );
}

export function resolveRecipients(people: DealPerson[], picks: Picks) {
  return people.flatMap((person) =>
    person.email !== null &&
    (picks.people.includes(person.email) ||
      picks.groups.some((group) => belongsTo(person, group)))
      ? [
          {
            user_id: person.user_id,
            contact_id:
              person.user_id === null ? person.entries[0]!.contact_id : null,
            email: person.email,
            name: person.name,
            entries: person.entries,
          },
        ]
      : [],
  );
}
