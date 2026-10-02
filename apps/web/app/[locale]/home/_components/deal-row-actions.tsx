'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import {
  archiveDeal,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';

const LOST_REASONS: { value: string; label: string }[] = [
  { value: 'offer_not_made', label: 'Offer not made' },
  { value: 'offer_not_accepted', label: 'Offer not accepted' },
  { value: 'deal_did_not_close', label: 'Deal did not close' },
  { value: 'listing_pulled_or_sold', label: 'Listing pulled or sold' },
  { value: 'other', label: 'Other' },
];

export function DealRowActions(props: {
  dealId: string;
  starred: boolean;
  archived: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState(LOST_REASONS[0]!.value);

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
          <Button variant={'ghost'} size={'sm'} disabled={pending}>
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
              run(() =>
                props.archived
                  ? unarchiveDeal({ deal_id: props.dealId })
                  : archiveDeal({ deal_id: props.dealId }),
              )
            }
          >
            {props.archived ? 'Unarchive' : 'Archive'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() =>
              run(() =>
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
              disabled={pending}
              onClick={() => {
                setLostOpen(false);
                run(() =>
                  setDealResolution({
                    deal_id: props.dealId,
                    resolution: 'lost',
                    resolution_reason:
                      lostReason as Parameters<
                        typeof setDealResolution
                      >[0]['resolution_reason'],
                  }),
                );
              }}
            >
              Mark lost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
