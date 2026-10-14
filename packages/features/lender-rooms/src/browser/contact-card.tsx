import { MailIcon } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@odb/ui/avatar';

export interface RoomContact {
  name: string | null;
  photoUrl: string | null;
  email: string;
  phone: string | null;
}

export function ContactCard({ contact }: { contact: RoomContact }) {
  return (
    <address
      className={
        'bg-card flex shrink-0 items-center gap-3 rounded-xl border p-4 not-italic md:max-w-xs'
      }
    >
      <Avatar className={'size-12'}>
        {contact.photoUrl ? (
          <AvatarImage
            src={contact.photoUrl}
            alt={''}
            className={'object-cover'}
          />
        ) : null}
        <AvatarFallback className={'bg-secondary font-medium'}>
          {contact.name ? contact.name.charAt(0) : <MailIcon aria-hidden />}
        </AvatarFallback>
      </Avatar>
      <div className={'flex min-w-0 flex-col text-sm'}>
        <span className={'text-muted-foreground text-xs'}>
          Your contact on this deal
        </span>
        {contact.name ? (
          <span className={'truncate font-medium'}>{contact.name}</span>
        ) : null}
        <a
          href={`mailto:${contact.email}`}
          className={'truncate underline-offset-2 hover:underline'}
        >
          {contact.email}
        </a>
        {contact.phone ? (
          <a
            href={`tel:${contact.phone}`}
            className={'underline-offset-2 hover:underline'}
          >
            {contact.phone}
          </a>
        ) : null}
      </div>
    </address>
  );
}
