'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import type { CloseState } from '@odb/lender-rooms/rooms/closing.ts';
import {
  closeSellerRoom,
  prepareSellerRoomClose,
  reopenSellerRoom,
} from '@odb/seller-rooms/rooms/actions.ts';
import { Button } from '@odb/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@odb/ui/dialog';

export function SellerRoomLifecycle({
  dealId,
  isClosed,
  isDealArchived,
  closing,
}: {
  dealId: string;
  isClosed: boolean;
  isDealArchived: boolean;
  closing: CloseState;
}) {
  const router = useRouter();
  const [isClosing, setIsClosing] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function run(change: typeof closeSellerRoom) {
    const result = await change({ dealId });

    setRefusal(result.ok ? null : result.refusal);
    router.refresh();
  }

  if (isDealArchived) {
    return (
      <p className={'text-muted-foreground text-sm'}>
        Unarchive the deal to reopen this room
      </p>
    );
  }

  return (
    <div className={'flex flex-col gap-2'}>
      <div>
        {isClosed ? (
          <Button type={'button'} onClick={() => void run(reopenSellerRoom)}>
            Reopen room
          </Button>
        ) : (
          <Button
            type={'button'}
            variant={'outline'}
            disabled={!closing.ready && closing.hasOwnTodo}
            onClick={() =>
              closing.ready
                ? setIsClosing(true)
                : void run(prepareSellerRoomClose)
            }
          >
            Close room
          </Button>
        )}
      </div>
      {!isClosed && !closing.ready && closing.hasOwnTodo ? (
        <p className={'text-muted-foreground text-sm'}>
          Tick &quot;Tell the seller/broker the room is closing&quot; in this
          deal&apos;s to-dos, or send an update to Sellers or Brokers, to close
          the room.
        </p>
      ) : null}
      {refusal ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {refusal}
        </p>
      ) : null}

      <Dialog open={isClosing} onOpenChange={setIsClosing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close the seller room?</DialogTitle>
            <DialogDescription>
              Every seller will lose access immediately. You can reopen the room
              later.
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
                void run(closeSellerRoom);
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
