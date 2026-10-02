'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import {
  archiveDeal,
  setDealListingStatus,
  setDealResolution,
  starDeal,
  unarchiveDeal,
  unstarDeal,
  updateDealStage,
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

const LISTING_STATUSES: { value: 'active' | 'pulled' | 'sold'; label: string }[] =
  [
    { value: 'active', label: 'Active' },
    { value: 'pulled', label: 'Pulled' },
    { value: 'sold', label: 'Sold' },
  ];

export function DealHeaderActions(props: {
  dealId: string;
  stage: string;
  stages: { key: string; label: string }[];
  listingStatus: string;
  archived: boolean;
  starred: boolean;
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
    <div className={'flex flex-wrap items-center gap-2'}>
      <Select
        value={props.stage}
        onValueChange={(stage) =>
          run(() => updateDealStage({ deal_id: props.dealId, stage }))
        }
      >
        <SelectTrigger className={'w-48'} disabled={pending}>
          <SelectValue placeholder={'Stage'} />
        </SelectTrigger>
        <SelectContent>
          {props.stages.map((stage) => (
            <SelectItem key={stage.key} value={stage.key}>
              {stage.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={props.listingStatus}
        onValueChange={(value) =>
          run(() =>
            setDealListingStatus({
              deal_id: props.dealId,
              listing_status: value as 'active' | 'pulled' | 'sold',
            }),
          )
        }
      >
        <SelectTrigger className={'w-36'} disabled={pending}>
          <SelectValue placeholder={'Listing'} />
        </SelectTrigger>
        <SelectContent>
          {LISTING_STATUSES.map((status) => (
            <SelectItem key={status.value} value={status.value}>
              {status.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant={'outline'}
        size={'sm'}
        disabled={pending}
        onClick={() =>
          run(() => setDealResolution({ deal_id: props.dealId, resolution: 'won' }))
        }
      >
        Mark won
      </Button>

      <Button
        variant={'outline'}
        size={'sm'}
        disabled={pending}
        onClick={() => setLostOpen(true)}
      >
        Mark lost
      </Button>

      <Button
        variant={'outline'}
        size={'sm'}
        disabled={pending}
        onClick={() =>
          run(() =>
            props.starred
              ? unstarDeal({ deal_id: props.dealId })
              : starDeal({ deal_id: props.dealId }),
          )
        }
      >
        {props.starred ? 'Unstar' : 'Star'}
      </Button>

      <Button
        variant={'outline'}
        size={'sm'}
        disabled={pending}
        onClick={() =>
          run(() =>
            props.archived
              ? unarchiveDeal({ deal_id: props.dealId })
              : archiveDeal({ deal_id: props.dealId }),
          )
        }
      >
        {props.archived ? 'Unarchive' : 'Archive'}
      </Button>

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
                    resolution_reason: lostReason as Parameters<
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
    </div>
  );
}
