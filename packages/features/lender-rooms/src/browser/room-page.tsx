import { z } from 'zod';

import { getSupabaseServerClient } from '@odb/supabase/server';

import { brandLogoUrl } from '../brand/logo-url';
import { getLastRoomVisit } from '../contents/last-visit';
import { lenderView } from '../contents/listing';
import { loadRoomListing } from '../contents/load-listing';
import { listLenderMembers } from '../members/actions';
import type { LenderRoomSummary } from '../members/entry-rules';
import { LocalTime } from '../requests-ui/local-time';
import { OpenRequestsSummary } from '../requests-ui/open-requests-summary';
import { ContactCard } from './contact-card';
import { headerFacts } from './header-facts';
import { PeopleInRoom } from './people-in-room';
import { RoomBrowser } from './room-browser';
import { loadRoomContact } from './room-contact';

export async function RoomPage({ room }: { room: LenderRoomSummary }) {
  const client = getSupabaseServerClient();
  const roomId = z.uuid().parse(room.id);
  const facts = headerFacts(room);

  const [loaded, logoUrl, contact, people, signedIn] = await Promise.all([
    getLastRoomVisit(client, roomId).then((since) =>
      loadRoomListing(client, { roomId, since }),
    ),
    facts.logoPath ? brandLogoUrl(facts.logoPath) : null,
    loadRoomContact(roomId),
    listLenderMembers({ roomId }),
    client.auth.getUser(),
  ]);

  const listing = loaded.viewer === 'deal_team' ? lenderView(loaded) : loaded;

  const userId = z.string().parse(signedIn.data.user?.id);

  if (!people.ok) {
    throw new Error(people.refusal);
  }

  if (!listing.master || !listing.private) {
    throw new Error(`Lender room ${roomId} is missing a root folder`);
  }

  return (
    <main data-wide className={'flex flex-col gap-8'}>
      <header
        className={
          'flex flex-col gap-6 border-b pb-8 md:flex-row md:items-start md:justify-between md:gap-10'
        }
      >
        <div className={'flex min-w-0 flex-col gap-5'}>
          <div className={'flex items-center gap-4'}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={''}
                className={
                  'bg-card size-14 shrink-0 rounded-xl border object-contain p-1.5'
                }
              />
            ) : (
              <span
                aria-hidden
                className={
                  'bg-primary text-primary-foreground flex size-14 shrink-0 items-center justify-center rounded-xl font-serif text-xl'
                }
              >
                {facts.initials}
              </span>
            )}
            <h1 className={'flex min-w-0 flex-col'}>
              <span className={'text-muted-foreground text-sm'}>
                Prepared for
              </span>
              <span
                className={
                  'font-serif text-3xl leading-tight font-medium text-balance sm:text-4xl'
                }
              >
                {facts.lenderName}
              </span>
            </h1>
          </div>

          <div className={'flex max-w-2xl flex-col gap-1'}>
            {facts.dealName ? (
              <p className={'text-lg font-medium'}>{facts.dealName}</p>
            ) : null}
            {facts.dealDescription ? (
              <p className={'text-muted-foreground'}>{facts.dealDescription}</p>
            ) : null}
          </div>

          {facts.welcomeNote ? (
            <p
              className={
                'border-primary/40 max-w-2xl border-l-2 pl-4 font-serif text-lg leading-relaxed whitespace-pre-line'
              }
            >
              {facts.welcomeNote}
            </p>
          ) : null}

          {facts.accessEnds ? (
            <p className={'text-muted-foreground text-sm'}>
              Access through <LocalTime at={facts.accessEnds} />
            </p>
          ) : null}
        </div>

        <div className={'flex shrink-0 flex-col gap-4 md:max-w-xs'}>
          <ContactCard contact={contact} />
          <PeopleInRoom people={people.value} viewerId={userId} />
        </div>
      </header>

      <OpenRequestsSummary roomId={roomId} dealName={facts.dealName} />

      <RoomBrowser
        roomId={roomId}
        userId={userId}
        places={{ shared: listing.master, own: listing.private }}
        packageLabel={facts.packageLabel}
        dealName={facts.dealName}
      />

      <footer className={'text-muted-foreground border-t pt-4 text-xs'}>
        Views and downloads in this room are recorded for {facts.recordedFor}.
      </footer>
    </main>
  );
}
