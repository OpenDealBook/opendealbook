'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import type { ActionResult } from '@odb/lender-rooms/actions/refusal.ts';
import { ProblemNote } from '@odb/lender-rooms/requests-ui/refusal-note.tsx';
import { useAttempt } from '@odb/lender-rooms/requests-ui/use-attempt.ts';
import type { CloseState } from '@odb/lender-rooms/rooms/closing.ts';
import {
  closeLenderRoom,
  prepareLenderRoomClose,
  reopenLenderRoom,
  setLenderRoomExpiry,
  setLenderRoomStatus,
  setLenderRoomWelcomeNote,
} from '@odb/lender-rooms/rooms/actions.ts';
import type { Enums } from '@odb/supabase';
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
import { Textarea } from '@odb/ui/textarea';

import { RoomAccessWording } from './lender-room-access';
import type { RoomAccess } from './lender-room-order';
import { roomStatusWording, teamSignInPath } from './lender-wording';

type RoomStatus = Enums<'lender_room_status'>;

export interface LifecycleRoom {
  id: string;
  name: string;
  status: RoomStatus;
  access: RoomAccess;
  welcomeNote: string | null;
  closing: CloseState;
}

const statuses = Object.keys(roomStatusWording) as RoomStatus[];

export function LenderRoomLifecycle({ room }: { room: LifecycleRoom }) {
  const router = useRouter();
  const { problem, isPending, attempt } = useAttempt();
  const [expiryDay, setExpiryDay] = useState('');
  const [welcomeNote, setWelcomeNote] = useState(room.welcomeNote ?? '');
  const [isClosing, setIsClosing] = useState(false);
  const roomId = room.id;

  function run(action: () => Promise<ActionResult<unknown>>) {
    attempt(action, () => router.refresh());
  }

  return (
    <div className={'flex flex-col gap-8'}>
      <section className={'flex flex-col gap-3'}>
        <h2 className={'text-sm font-medium'}>Status</h2>
        <div className={'flex flex-wrap gap-2'}>
          {statuses.map((status) => (
            <Button
              key={status}
              size={'sm'}
              variant={status === room.status ? 'default' : 'outline'}
              aria-pressed={status === room.status}
              disabled={isPending}
              onClick={() => run(() => setLenderRoomStatus({ roomId, status }))}
            >
              {roomStatusWording[status]}
            </Button>
          ))}
        </div>
      </section>

      <section className={'flex flex-col gap-3'}>
        <h2 className={'text-sm font-medium'}>Access</h2>
        <p className={'text-sm'}>
          <RoomAccessWording access={room.access} />
        </p>
        <form
          className={'flex flex-wrap items-end gap-2'}
          onSubmit={(event) => {
            event.preventDefault();
            run(() =>
              setLenderRoomExpiry({
                roomId,
                date: expiryDay,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              }),
            );
          }}
        >
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'room-expiry'}>Expiry date</Label>
            <Input
              id={'room-expiry'}
              type={'date'}
              value={expiryDay}
              onChange={(event) => setExpiryDay(event.target.value)}
              required
            />
          </div>
          <Button type={'submit'} variant={'outline'} disabled={isPending}>
            Save expiry
          </Button>
          {room.access.kind === 'closed' ? null : (
            <Button
              type={'button'}
              variant={'outline'}
              disabled={
                isPending || (!room.closing.ready && room.closing.hasOwnTodo)
              }
              onClick={() =>
                room.closing.ready
                  ? setIsClosing(true)
                  : run(() => prepareLenderRoomClose({ roomId }))
              }
            >
              Close room
            </Button>
          )}
          {room.access.kind === 'open' ? null : (
            <Button
              type={'button'}
              disabled={isPending}
              onClick={() => run(() => reopenLenderRoom({ roomId }))}
            >
              Reopen room
            </Button>
          )}
        </form>
        {room.access.kind !== 'closed' &&
        !room.closing.ready &&
        room.closing.hasOwnTodo ? (
          <p className={'text-muted-foreground text-sm'}>
            {`Tick "Tell ${room.name} the room is closing" in this deal's to-dos, or send an update to someone in this room, to close it.`}
          </p>
        ) : null}
      </section>

      <form
        className={'flex max-w-2xl flex-col gap-2'}
        onSubmit={(event) => {
          event.preventDefault();
          run(() => setLenderRoomWelcomeNote({ roomId, welcomeNote }));
        }}
      >
        <Label htmlFor={'room-welcome-note'}>Welcome note</Label>
        <Textarea
          id={'room-welcome-note'}
          value={welcomeNote}
          rows={4}
          onChange={(event) => setWelcomeNote(event.target.value)}
        />
        <p className={'text-muted-foreground text-sm'}>
          Shown at the top of this lender&apos;s room.
        </p>
        <Button
          type={'submit'}
          variant={'outline'}
          className={'w-fit'}
          disabled={isPending}
        >
          Save welcome note
        </Button>
      </form>

      <ProblemNote problem={problem} signInPath={teamSignInPath} />

      <Dialog open={isClosing} onOpenChange={setIsClosing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close the {room.name} room?</DialogTitle>
            <DialogDescription>
              Everyone at {room.name} will lose access immediately. You can
              reopen the room later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant={'outline'} onClick={() => setIsClosing(false)}>
              Keep open
            </Button>
            <Button
              variant={'destructive'}
              onClick={() => {
                setIsClosing(false);
                run(() => closeLenderRoom({ roomId }));
              }}
            >
              Close this room
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
