import { ROLE_LABELS } from '@odb/team-accounts/role-labels';

type MainContact = {
  side: 'buyer' | 'seller' | 'lender';
  name: string;
  role: string;
  company: string | null;
  phone: string | null;
  email: string;
};

const SIDE_LABEL = { buyer: 'Buyer', seller: 'Seller', lender: 'Lender' };

export function MainContacts({ contacts }: { contacts: MainContact[] }) {
  if (contacts.length === 0) {
    return null;
  }

  return (
    <section className={'flex flex-col gap-2'}>
      <h2 className={'text-lg font-semibold'}>Main contacts</h2>
      <ul className={'grid gap-3 sm:grid-cols-2'}>
        {contacts.map((contact) => (
          <li
            key={`${contact.side}-${contact.email}-${contact.role}`}
            className={'flex flex-col rounded-md border p-3 text-sm'}
          >
            <span className={'text-muted-foreground text-xs'}>
              {SIDE_LABEL[contact.side]}
            </span>
            <span className={'font-medium'}>{contact.name}</span>
            <span>
              {[ROLE_LABELS[contact.role], contact.company]
                .filter(Boolean)
                .join(', ')}
            </span>
            {contact.phone ? <span>{contact.phone}</span> : null}
            <a
              href={`mailto:${contact.email}`}
              className={'text-muted-foreground underline'}
            >
              {contact.email}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
