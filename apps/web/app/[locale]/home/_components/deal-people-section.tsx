'use client';

import { useState } from 'react';

import {
  addDealContact,
  attachDealContact,
  editDealContact,
  removeDealContact,
  starMainContact,
  unstarMainContact,
} from '@odb/deal-people/actions.ts';
import type {
  AddressBookContact,
  DealPersonEntry,
  DealRoster,
} from '@odb/deal-people/queries.ts';
import {
  type ContactFields,
  contactRoles,
  dealSides,
} from '@odb/deal-people/schema.ts';
import { ROLE_LABELS } from '@odb/team-accounts/role-labels';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { Input } from '@odb/ui/input';

import { useRefusableAction } from './use-refusable-action';

const SIDE_LABELS: Record<(typeof dealSides)[number], string> = {
  buyer: 'Buyer',
  seller: 'Seller',
  lender: 'Lender',
};

const BLANK_CONTACT: ContactFields = {
  name: '',
  role: 'other',
  side: 'buyer',
  company: '',
  phone: '',
  email: '',
};

const selectClass = 'bg-background h-9 rounded-md border px-2 text-sm';

function displayName(person: DealRoster['people'][number]) {
  const handle = person.email?.split('@')[0];

  return person.name === handle
    ? (person.entries.find((entry) => entry.name && entry.name !== handle)
        ?.name ?? person.name)
    : person.name;
}

export function DealPeopleSection({
  dealId,
  roster,
}: {
  dealId: string;
  roster: DealRoster;
}) {
  const { refusal, pending: isSaving, run } = useRefusableAction();
  const [editing, setEditing] = useState<string | null>(null);

  function toggleStar(entry: DealPersonEntry) {
    const slot = {
      dealId,
      side: entry.side,
      lenderRoomId: entry.lender_room_id,
    };

    run(() =>
      entry.is_main
        ? unstarMainContact(slot)
        : starMainContact({
            ...slot,
            who:
              entry.source === 'contact'
                ? { contactId: entry.contact_id }
                : { userId: entry.user_id },
          }),
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>People</CardTitle>
      </CardHeader>
      <CardContent className={'flex flex-col gap-4'}>
        <ul className={'divide-y'}>
          {roster.people
            .map((person) => ({ ...person, name: displayName(person) }))
            .map((person) => (
              <li
                key={
                  person.user_id ??
                  person.entries.map((entry) => entry.contact_id).join()
                }
                className={'flex flex-col gap-1 py-3'}
              >
                <span className={'font-medium'}>{person.name}</span>
                <span className={'text-muted-foreground text-sm'}>
                  {person.email ?? 'no email'}
                </span>
                {person.entries.map((entry) =>
                  entry.source === 'contact' && editing === entry.contact_id ? (
                    <ContactForm
                      key={entry.contact_id}
                      initial={{
                        name: person.name,
                        role: entry.role,
                        side: entry.side,
                        company: entry.company ?? '',
                        phone: entry.phone ?? '',
                        email: person.email ?? '',
                      }}
                      submitLabel={'Save contact'}
                      disabled={isSaving}
                      onSubmit={(fields) =>
                        run(
                          () =>
                            editDealContact({
                              dealId,
                              contactId: entry.contact_id,
                              ...fields,
                            }),
                          () => setEditing(null),
                        )
                      }
                    />
                  ) : (
                    <div
                      key={`${entry.source}-${entry.side}-${entry.lender_room_id ?? entry.contact_id}`}
                      className={'flex flex-wrap items-center gap-2 text-sm'}
                    >
                      <span>{ROLE_LABELS[entry.role]}</span>
                      <span className={'text-muted-foreground'}>
                        {SIDE_LABELS[entry.side]}
                      </span>
                      {entry.company ? <span>{entry.company}</span> : null}
                      {entry.phone ? (
                        <span className={'text-muted-foreground'}>
                          {entry.phone}
                        </span>
                      ) : null}
                      {entry.room_closed ? (
                        <Badge variant={'outline'}>Room closed</Badge>
                      ) : null}
                      {entry.is_main ? <Badge>Main contact</Badge> : null}
                      {roster.canEdit &&
                      !(
                        entry.source === 'contact' && entry.side === 'lender'
                      ) ? (
                        <Button
                          type={'button'}
                          size={'sm'}
                          variant={'ghost'}
                          disabled={isSaving}
                          aria-label={
                            entry.is_main
                              ? `Clear ${person.name} as main contact`
                              : `Make ${person.name} a main contact`
                          }
                          onClick={() => toggleStar(entry)}
                        >
                          {entry.is_main ? 'Unstar' : 'Star'}
                        </Button>
                      ) : null}
                      {roster.canEdit && entry.source === 'contact' ? (
                        <>
                          <Button
                            type={'button'}
                            size={'sm'}
                            variant={'ghost'}
                            aria-label={`Edit ${person.name}`}
                            onClick={() => setEditing(entry.contact_id)}
                          >
                            Edit
                          </Button>
                          <Button
                            type={'button'}
                            size={'sm'}
                            variant={'ghost'}
                            disabled={isSaving}
                            aria-label={`Remove ${person.name}`}
                            onClick={() =>
                              run(() =>
                                removeDealContact({
                                  dealId,
                                  contactId: entry.contact_id,
                                }),
                              )
                            }
                          >
                            Remove
                          </Button>
                        </>
                      ) : null}
                    </div>
                  ),
                )}
              </li>
            ))}
        </ul>
        {roster.canEdit ? (
          <ContactForm
            initial={BLANK_CONTACT}
            submitLabel={'Add contact'}
            disabled={isSaving}
            onSubmit={(fields) =>
              run(() => addDealContact({ dealId, ...fields }))
            }
            search={{
              addressBook: roster.addressBook,
              onUse: (contact, { role, side }) =>
                run(() =>
                  attachDealContact({
                    dealId,
                    contactId: contact.id,
                    role,
                    side,
                  }),
                ),
            }}
          />
        ) : null}
        {refusal ? (
          <p role={'alert'} className={'text-destructive text-sm'}>
            {refusal}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ContactForm({
  initial,
  submitLabel,
  disabled,
  onSubmit,
  search,
}: {
  initial: ContactFields;
  submitLabel: string;
  disabled: boolean;
  onSubmit: (fields: ContactFields) => void;
  search?: {
    addressBook: AddressBookContact[];
    onUse: (contact: AddressBookContact, fields: ContactFields) => void;
  };
}) {
  const [fields, setFields] = useState(initial);
  const query = fields.name.trim().toLowerCase();
  const matches = query
    ? (search?.addressBook ?? []).filter((contact) =>
        [contact.name, contact.email].some((text) =>
          text?.toLowerCase().includes(query),
        ),
      )
    : [];

  function field(key: 'name' | 'company' | 'phone' | 'email', label: string) {
    return (
      <Input
        aria-label={`Contact ${key}`}
        placeholder={label}
        value={fields[key]}
        onChange={(event) =>
          setFields({ ...fields, [key]: event.target.value })
        }
      />
    );
  }

  return (
    <div className={'grid gap-2 sm:grid-cols-3'}>
      {field('name', 'Name')}
      <select
        aria-label={'Contact role'}
        className={selectClass}
        value={fields.role}
        onChange={(event) =>
          setFields({
            ...fields,
            role: contactRoles.find((role) => role === event.target.value)!,
          })
        }
      >
        {contactRoles.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABELS[role]}
          </option>
        ))}
      </select>
      <select
        aria-label={'Contact side'}
        className={selectClass}
        value={fields.side}
        onChange={(event) =>
          setFields({
            ...fields,
            side: dealSides.find((side) => side === event.target.value)!,
          })
        }
      >
        {dealSides.map((side) => (
          <option key={side} value={side}>
            {SIDE_LABELS[side]}
          </option>
        ))}
      </select>
      {field('company', 'Company')}
      {field('phone', 'Phone')}
      {field('email', 'Email')}
      <Button
        type={'button'}
        aria-label={submitLabel}
        disabled={disabled}
        onClick={() => onSubmit(fields)}
      >
        {submitLabel}
      </Button>
      {matches.length > 0 ? (
        <ul className={'flex flex-col gap-1 sm:col-span-3'}>
          {matches.map((contact) => (
            <li
              key={contact.id}
              className={'flex flex-wrap items-center gap-2 text-sm'}
            >
              <span className={'font-medium'}>{contact.name}</span>
              <span className={'text-muted-foreground'}>
                {[contact.company, contact.email].filter(Boolean).join(' · ')}
              </span>
              <Button
                type={'button'}
                size={'sm'}
                variant={'outline'}
                disabled={disabled}
                aria-label={`Use ${contact.name}`}
                onClick={() => search?.onUse(contact, fields)}
              >
                Use existing contact
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
