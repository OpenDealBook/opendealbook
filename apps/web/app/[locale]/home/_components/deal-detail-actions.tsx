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

import { DeleteDealDialog } from './deal-row-actions';
import { useRefusableAction } from './use-refusable-action';

const LOST_REASONS: { value: string; label: string }[] = [
  { value: 'offer_not_made', label: 'Offer not made' },
  { value: 'offer_not_accepted', label: 'Offer not accepted' },
  { value: 'deal_did_not_close', label: 'Deal did not close' },
  { value: 'listing_pulled_or_sold', label: 'Listing pulled or sold' },
  { value: 'other', label: 'Other' },
];

const LISTING_STATUSES: {
  value: 'active' | 'pulled' | 'sold';
  label: string;
}[] = [
  { value: 'active', label: 'Active' },
  { value: 'pulled', label: 'Pulled' },
  { value: 'sold', label: 'Sold' },
];

export function DealStarButton(props: { dealId: string; starred: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant={'outline'}
      size={'sm'}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await (props.starred
            ? unstarDeal({ deal_id: props.dealId })
            : starDeal({ deal_id: props.dealId }));
          router.refresh();
        })
      }
    >
      {props.starred ? 'Unstar' : 'Star'}
    </Button>
  );
}

export function DealHeaderActions(props: {
  dealId: string;
  dealName: string;
  dealsHref: string;
  stage: string;
  stages: { key: string; label: string }[];
  listingStatus: string;
  archived: boolean;
  isOwner: boolean;
}) {
  const router = useRouter();
  const refusable = useRefusableAction();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState(LOST_REASONS[0]!.value);

  return (
    <div className={'flex flex-wrap items-center gap-2'}>
      <Select
        value={props.stage}
        onValueChange={(stage) =>
          refusable.run(() => updateDealStage({ deal_id: props.dealId, stage }))
        }
      >
        <SelectTrigger className={'w-48'} disabled={refusable.pending}>
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
          refusable.run(() =>
            setDealListingStatus({
              deal_id: props.dealId,
              listing_status: value as 'active' | 'pulled' | 'sold',
            }),
          )
        }
      >
        <SelectTrigger className={'w-36'} disabled={refusable.pending}>
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
        disabled={refusable.pending}
        onClick={() =>
          refusable.run(() =>
            setDealResolution({ deal_id: props.dealId, resolution: 'won' }),
          )
        }
      >
        Mark won
      </Button>

      <Button
        variant={'outline'}
        size={'sm'}
        disabled={refusable.pending}
        onClick={() => setLostOpen(true)}
      >
        Mark lost
      </Button>

      <Button
        variant={'outline'}
        size={'sm'}
        disabled={refusable.pending}
        onClick={() =>
          refusable.run(() =>
            props.archived
              ? unarchiveDeal({ deal_id: props.dealId })
              : archiveDeal({ deal_id: props.dealId }),
          )
        }
      >
        {props.archived ? 'Unarchive' : 'Archive'}
      </Button>

      {props.archived && props.isOwner ? (
        <Button
          variant={'outline'}
          size={'sm'}
          onClick={() => setDeleteOpen(true)}
        >
          Delete
        </Button>
      ) : null}

      <DeleteDealDialog
        dealId={props.dealId}
        dealName={props.dealName}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => router.push(props.dealsHref)}
      />

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
                      resolution_reason: lostReason as Parameters<
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
      {refusable.refusal ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {refusable.refusal}
        </p>
      ) : null}
    </div>
  );
}
