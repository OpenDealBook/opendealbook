'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import {
  addLenderContact,
  deleteLenderContact,
  editLenderContact,
  setPrimaryLenderContact,
} from '@odb/lender-rooms/crm/lenders/actions.ts';
import { ProblemNote } from '@odb/lender-rooms/requests-ui/refusal-note.tsx';
import { useAttempt } from '@odb/lender-rooms/requests-ui/use-attempt.ts';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@odb/ui/dialog';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';

import { teamSignInPath } from '../lender-wording';
import { ConfirmButton } from './confirm-button';
import type { SavedContact, SavedLender } from './saved-lender';

function ContactFields({
  lenderId,
  contact,
  onSaved,
}: {
  lenderId: string;
  contact: SavedContact | undefined;
  onSaved: () => void;
}) {
  const saving = useAttempt();
  const [name, setName] = useState(contact?.name ?? '');
  const [email, setEmail] = useState(contact?.email ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');

  function save() {
    saving.attempt(
      () =>
        contact
          ? editLenderContact({
              contactId: contact.id,
              name,
              email: email.trim() || null,
              phone: phone.trim() || null,
            })
          : addLenderContact({
              lenderId,
              name,
              email: email.trim() || undefined,
              phone: phone.trim() || undefined,
            }),
      onSaved,
    );
  }

  return (
    <form
      className={'flex flex-col gap-4'}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'lender-contact-name'}>Contact name</Label>
        <Input
          id={'lender-contact-name'}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'lender-contact-email'}>Email</Label>
        <Input
          id={'lender-contact-email'}
          type={'email'}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'lender-contact-phone'}>Phone</Label>
        <Input
          id={'lender-contact-phone'}
          type={'tel'}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </div>
      <ProblemNote problem={saving.problem} signInPath={teamSignInPath} />
      <DialogFooter>
        <Button type={'submit'} disabled={saving.isPending}>
          Save contact
        </Button>
      </DialogFooter>
    </form>
  );
}

function ContactDialog({
  lender,
  contact,
}: {
  lender: SavedLender;
  contact?: SavedContact;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        variant={contact ? 'ghost' : 'outline'}
        size={'sm'}
        aria-label={
          contact ? `Edit ${contact.name}` : `Add contact to ${lender.name}`
        }
        onClick={() => setIsOpen(true)}
      >
        {contact ? 'Edit' : 'Add contact'}
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {contact
                ? `Edit ${contact.name}`
                : `Add a contact at ${lender.name}`}
            </DialogTitle>
          </DialogHeader>
          <ContactFields
            lenderId={lender.id}
            contact={contact}
            onSaved={() => {
              setIsOpen(false);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function LenderContacts({ lender }: { lender: SavedLender }) {
  const router = useRouter();
  const changing = useAttempt();

  return (
    <div className={'flex flex-col gap-2'}>
      <div className={'flex items-center justify-between gap-3'}>
        <h4 className={'text-sm font-medium'}>Contacts</h4>
        <ContactDialog lender={lender} />
      </div>
      {lender.lender_contact.length === 0 ? (
        <p className={'text-muted-foreground text-sm'}>
          No contacts yet. Add one with an email and make them primary to set up
          rooms and send outreach.
        </p>
      ) : (
        <ul className={'divide-y rounded-lg border'}>
          {lender.lender_contact.map((contact) => (
            <li
              key={contact.id}
              className={
                'flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm'
              }
            >
              <div className={'flex min-w-0 flex-col'}>
                <span className={'flex items-center gap-2 font-medium'}>
                  {contact.name}
                  {contact.is_primary ? <Badge>Primary</Badge> : null}
                </span>
                <span className={'text-muted-foreground truncate'}>
                  {[contact.email, contact.phone].filter(Boolean).join(', ') ||
                    'No email or phone'}
                </span>
              </div>
              <div className={'flex items-center gap-1'}>
                {contact.is_primary ? null : (
                  <Button
                    variant={'ghost'}
                    size={'sm'}
                    aria-label={`Make ${contact.name} primary`}
                    disabled={changing.isPending}
                    onClick={() =>
                      changing.attempt(
                        () =>
                          setPrimaryLenderContact({ contactId: contact.id }),
                        () => router.refresh(),
                      )
                    }
                  >
                    Make primary
                  </Button>
                )}
                <ContactDialog lender={lender} contact={contact} />
                <ConfirmButton
                  label={`Delete ${contact.name}`}
                  title={`Delete ${contact.name}?`}
                  description={`This removes ${contact.name} from ${lender.name}.`}
                  confirmLabel={'Delete contact'}
                  action={() => deleteLenderContact({ contactId: contact.id })}
                  onDone={() => router.refresh()}
                >
                  Delete
                </ConfirmButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ProblemNote problem={changing.problem} signInPath={teamSignInPath} />
    </div>
  );
}
