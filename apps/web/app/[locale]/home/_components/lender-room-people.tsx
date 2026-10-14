'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import {
  inviteLenderMember,
  removeLenderMember,
} from '@odb/lender-rooms/members/actions.ts';
import { LocalTime } from '@odb/lender-rooms/requests-ui/local-time.tsx';
import {
  LiveRegion,
  ProblemNote,
} from '@odb/lender-rooms/requests-ui/refusal-note.tsx';
import { useAttempt } from '@odb/lender-rooms/requests-ui/use-attempt.ts';
import { Button } from '@odb/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@odb/ui/dialog';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';

import type { RoomStats } from './lender-people-stats';
import { countWording, personLabel, teamSignInPath } from './lender-wording';

interface Member extends RoomStats {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
}

interface RemovedPerson extends RoomStats {
  userId: string;
  email: string;
  name: string | null;
  invitedAt: string;
  removedAt: string;
}

function StatsLine({ stats }: { stats: RoomStats }) {
  return (
    <>
      {stats.firstOpenedAt ? (
        <span>
          First opened the room <LocalTime at={stats.firstOpenedAt} />
        </span>
      ) : (
        <span>Has not opened the room yet</span>
      )}
      {stats.lastVisitAt ? (
        <span>
          Last visit <LocalTime at={stats.lastVisitAt} />
        </span>
      ) : null}
      <span>
        {countWording(stats.filesViewed, 'file viewed', 'files viewed')}
      </span>
      <span>{countWording(stats.downloads, 'download', 'downloads')}</span>
    </>
  );
}

export function LenderRoomPeople({
  roomId,
  members,
  removed,
}: {
  roomId: string;
  members: Member[];
  removed: RemovedPerson[];
}) {
  const router = useRouter();
  const { problem, isPending, attempt } = useAttempt();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [membersSeen, setMembersSeen] = useState(members);

  if (membersSeen !== members) {
    setMembersSeen(members);

    if (members.some((member) => member.email === email.trim().toLowerCase())) {
      setEmail('');
      setName('');
    }
  }
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);

  function sendLink(
    invite: { email: string; name?: string },
    sentWording: string,
  ) {
    attempt(
      async () => {
        const result = await inviteLenderMember({ roomId, ...invite });

        router.refresh();

        return result;
      },
      () => {
        setAnnouncement(`${sentWording} ${invite.email}`);
        setEmail('');
        setName('');
      },
    );
  }

  return (
    <div className={'flex flex-col gap-6'}>
      <form
        className={'flex flex-wrap items-end gap-2'}
        onSubmit={(event) => {
          event.preventDefault();
          sendLink({ email, name }, 'Invite sent to');
        }}
      >
        <div className={'flex w-full max-w-sm flex-col gap-2'}>
          <Label htmlFor={'lender-invite-email'}>Email</Label>
          <Input
            id={'lender-invite-email'}
            type={'email'}
            value={email}
            placeholder={'name@lender.com'}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className={'flex w-full max-w-xs flex-col gap-2'}>
          <Label htmlFor={'lender-invite-name'}>Name (optional)</Label>
          <Input
            id={'lender-invite-name'}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <Button type={'submit'} disabled={isPending}>
          Invite
        </Button>
      </form>
      <p className={'text-muted-foreground -mt-4 text-sm'}>
        They get an emailed link that signs them in to this room only.
      </p>

      <ProblemNote problem={problem} signInPath={teamSignInPath} />
      <LiveRegion message={announcement} />

      {members.length === 0 ? (
        <p className={'text-muted-foreground text-sm'}>
          Nobody has been invited to this room yet.
        </p>
      ) : (
        <ul className={'divide-y rounded-lg border'}>
          {members.map((member) => (
            <li
              key={member.id}
              className={
                'flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5'
              }
            >
              <div className={'flex min-w-0 flex-col'}>
                <span className={'truncate font-medium'}>
                  {personLabel(member)}
                </span>
                <span
                  className={
                    'text-muted-foreground flex flex-wrap gap-x-3 text-xs'
                  }
                >
                  <span>
                    Invited <LocalTime at={member.created_at} />
                  </span>
                  <StatsLine stats={member} />
                </span>
              </div>
              <div className={'flex gap-1'}>
                <Button
                  size={'sm'}
                  variant={'ghost'}
                  disabled={isPending}
                  aria-label={`Resend link to ${member.email}`}
                  onClick={() =>
                    sendLink({ email: member.email }, 'Link sent to')
                  }
                >
                  Resend link
                </Button>
                <Button
                  size={'sm'}
                  variant={'ghost'}
                  disabled={isPending}
                  aria-label={`Remove ${member.email}`}
                  onClick={() => setRemoving(member)}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {removed.length === 0 ? null : (
        <section
          aria-labelledby={'removed-people'}
          className={'flex flex-col gap-2'}
        >
          <h2 id={'removed-people'} className={'text-sm font-medium'}>
            Removed
          </h2>
          <ul className={'divide-y rounded-lg border'}>
            {removed.map((person) => (
              <li key={person.userId} className={'flex flex-col px-4 py-2.5'}>
                <span className={'text-muted-foreground truncate font-medium'}>
                  {personLabel(person)}
                </span>
                <span
                  className={
                    'text-muted-foreground flex flex-wrap gap-x-3 text-xs'
                  }
                >
                  <span>
                    Invited <LocalTime at={person.invitedAt} />
                  </span>
                  <span>
                    Removed <LocalTime at={person.removedAt} />
                  </span>
                  <StatsLine stats={person} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Dialog
        open={removing !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setRemoving(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.email} from this room?</DialogTitle>
            <DialogDescription>
              They lose access immediately. Their past activity, requests, and
              messages stay.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant={'outline'} onClick={() => setRemoving(null)}>
              Keep in room
            </Button>
            <Button
              variant={'destructive'}
              disabled={isPending}
              onClick={() => {
                const { id: memberId } = removing!;

                setRemoving(null);
                attempt(
                  () => removeLenderMember({ memberId }),
                  () => router.refresh(),
                );
              }}
            >
              Remove person
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
