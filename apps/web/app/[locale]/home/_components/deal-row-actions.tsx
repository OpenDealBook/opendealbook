'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import {
  archiveDeal,
  deleteDeal,
  setDealResolution,
  starDeal,
  unarchiveDeal,
  unstarDeal,
} from '@odb/deals/server';
import { Button } from '@odb/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@odb/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@odb/ui/dropdown-menu';
import { Input } from '@odb/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';

import { useRefusableAction } from './use-refusable-action';

const LOST_REASONS: { value: string; label: string }[] = [
  { value: 'offer_not_made', label: 'Offer not made' },
  { value: 'offer_not_accepted', label: 'Offer not accepted' },
  { value: 'deal_did_not_close', label: 'Deal did not close' },
  { value: 'listing_pulled_or_sold', label: 'Listing pulled or sold' },
  { value: 'other', label: 'Other' },
];

export function DeleteDealDialog(props: {
  dealId: string;
  dealName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const refusable = useRefusableAction();
  const [typed, setTyped] = useState('');

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete deal</DialogTitle>
        </DialogHeader>
        <p className={'text-sm'}>
          This permanently deletes {props.dealName} with its files, history and
          rooms. Type <strong>{props.dealName}</strong> to confirm.
        </p>
        <Input
          aria-label={'Deal name'}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
        {refusable.refusal ? (
          <p role={'alert'} className={'text-destructive text-sm'}>
            {refusable.refusal}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            variant={'outline'}
            onClick={() => props.onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant={'destructive'}
            disabled={typed !== props.dealName || refusable.pending}
            onClick={() =>
              refusable.run(
                () =>
                  deleteDeal({ deal_id: props.dealId, confirm_name: typed }),
                props.onDeleted,
              )
            }
          >
            Delete deal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DealRowActions(props: {
  dealId: string;
  dealName: string;
  starred: boolean;
  archived: boolean;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const refusable = useRefusableAction();
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState(LOST_REASONS[0]!.value);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={'ghost'}
            size={'sm'}
            disabled={pending || refusable.pending}
          >
            Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={'end'}>
          <DropdownMenuItem
            onSelect={() =>
              run(() =>
                props.starred
                  ? unstarDeal({ deal_id: props.dealId })
                  : starDeal({ deal_id: props.dealId }),
              )
            }
          >
            {props.starred ? 'Unstar' : 'Star'}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              refusable.run(() =>
                props.archived
                  ? unarchiveDeal({ deal_id: props.dealId })
                  : archiveDeal({ deal_id: props.dealId }),
              )
            }
          >
            {props.archived ? 'Unarchive' : 'Archive'}
          </DropdownMenuItem>
          {props.archived && props.isOwner ? (
            <DropdownMenuItem onSelect={() => setDeleteOpen(true)}>
              Delete
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() =>
              refusable.run(() =>
                setDealResolution({
                  deal_id: props.dealId,
                  resolution: 'won',
                }),
              )
            }
          >
            Mark won
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setLostOpen(true)}>
            Mark lost
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={lostOpen} onOpenChange={setLostOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark deal lost</DialogTitle>
          </DialogHeader>
          <Select value={lostReason} onValueChange={setLostReason}>
            <SelectTrigger className={'w-full'}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOST_REASONS.map((reason) => (
                <SelectItem key={reason.value} value={reason.value}>
                  {reason.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant={'outline'} onClick={() => setLostOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={'destructive'}
              disabled={refusable.pending}
              onClick={() =>
                refusable.run(
                  () =>
                    setDealResolution({
                      deal_id: props.dealId,
                      resolution: 'lost',
                      resolution_reason:
                        lostReason as Parameters<
                          typeof setDealResolution
                        >[0]['resolution_reason'],
                    }),
                  () => setLostOpen(false),
                )
              }
            >
              Mark lost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DeleteDealDialog
        dealId={props.dealId}
        dealName={props.dealName}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
      {refusable.refusal ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {refusable.refusal}
        </p>
      ) : null}
    </>
  );
}
