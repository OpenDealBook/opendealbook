import type { ReactNode } from 'react';

import Link from 'next/link';

import { z } from 'zod';

import { getSupabaseServerClient } from '@odb/supabase/server';

import { brandLogoUrl } from '../brand/logo-url';
import { getLastRoomVisit } from '../contents/last-visit';
import { lenderView } from '../contents/listing';
import { loadRoomListing } from '../contents/load-listing';
import { listLenderMembers } from '../members/actions';
import type { LenderRoomSummary } from '../members/entry-rules';
import { OpenRequestsSummary } from '../requests-ui/open-requests-summary';
import { ContactCard } from './contact-card';
import { headerFacts } from './header-facts';
import { LenderRoomBrowser } from './lender-room-browser';
import { LocalDate } from './local-date';
import { PeopleInRoom } from './people-in-room';
import { loadRoomContact } from './room-contact';

export async function RoomPage({
  room,
  question,
}: {
  room: LenderRoomSummary;
  question: ReactNode;
}) {
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
          <p
            className={
              'text-muted-foreground flex items-center gap-2.5 text-sm'
            }
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={''}
                className={
                  'bg-card size-8 shrink-0 rounded-md border object-contain p-1'
                }
              />
            ) : (
              <span
                aria-hidden
                className={
                  'bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-md font-serif text-sm'
                }
              >
                {facts.initials}
              </span>
            )}
            <span>
              Prepared for{' '}
              <span className={'text-foreground font-medium'}>
                {facts.lenderName}
              </span>
            </span>
          </p>

          <h1
            className={
              'font-serif text-3xl leading-tight font-medium text-balance sm:text-4xl'
            }
          >
            {facts.dealName}
          </h1>

          <dl
            className={
              'grid max-w-2xl grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-base'
            }
          >
            {[
              ['Buyer', facts.buyerTeam],
              ['Loan ask', facts.loanAsk],
              ['Close by', facts.closeBy],
            ]
              .filter(([, value]) => value !== null)
              .map(([term, value]) => (
                <div key={term} className={'contents'}>
                  <dt className={'text-muted-foreground'}>{term}</dt>
                  <dd className={'font-medium tabular-nums'}>{value}</dd>
                </div>
              ))}
          </dl>

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
              Room open until <LocalDate at={facts.accessEnds} />
            </p>
          ) : null}
        </div>

        <div className={'flex shrink-0 flex-col gap-4 md:max-w-xs'}>
          <ContactCard contact={contact} />
          <PeopleInRoom people={people.value} viewerId={userId} />
        </div>
      </header>

      {question}

      <nav aria-label={'Room pages'} className={'grid gap-3 sm:grid-cols-2'}>
        <OpenRequestsSummary roomId={roomId} dealName={facts.dealName} />
        <Link
          href={`/lender/${roomId}/faq`}
          className={
            'hover:bg-accent focus-visible:ring-ring/50 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg border px-4 py-3 text-sm outline-none focus-visible:ring-[3px]'
          }
        >
          <span className={'font-medium'}>FAQ</span>
          <span className={'text-muted-foreground'}>
            Answers to common questions
          </span>
        </Link>
      </nav>

      <LenderRoomBrowser
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
