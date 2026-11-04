'use client';

import { useState, useTransition, type ReactNode } from 'react';

import { useRouter } from 'next/navigation';

import { MoreHorizontalIcon } from 'lucide-react';

import {
  archiveDeal,
  setDealListingStatus,
  setDealResolution,
  setEarningsBasis,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@odb/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@odb/ui/tooltip';

import { DealIntakeRerun } from './deal-intake-rerun';
import { DeleteDealDialog } from './deal-row-actions';
import { useRefusableAction } from './use-refusable-action';

const LOST_REASONS: { value: string; label: string }[] = [
  { value: 'offer_not_made', label: 'Offer not made' },
  { value: 'offer_not_accepted', label: 'Offer not accepted' },
  { value: 'deal_did_not_close', label: 'Deal did not close' },
  { value: 'listing_pulled_or_sold', label: 'Listing pulled or sold' },
  { value: 'other', label: 'Other' },
];

type ListingStatus = 'active' | 'pulled' | 'sold';
type EarningsBasis = 'sde' | 'ebitda';

const LISTING_STATUSES: { value: ListingStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'pulled', label: 'Pulled' },
  { value: 'sold', label: 'Sold' },
];

const EARNINGS_BASES: { value: EarningsBasis; label: string }[] = [
  { value: 'sde', label: 'SDE' },
  { value: 'ebitda', label: 'EBITDA' },
];

function ManagersOnly(props: {
  allowed: boolean;
  label: string;
  children: ReactNode;
}) {
  if (props.allowed) {
    return props.children;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuItem
          aria-disabled
          className={'opacity-50'}
          onSelect={(event) => event.preventDefault()}
        >
          {props.label}
        </DropdownMenuItem>
      </TooltipTrigger>
      <TooltipContent side={'left'}>Managers only</TooltipContent>
    </Tooltip>
  );
}

export function DealStageSelect(props: {
  dealId: string;
  stage: string;
  stages: { key: string; label: string }[];
}) {
  const refusable = useRefusableAction();

  return (
    <div className={'flex flex-col gap-1'}>
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
      {refusable.refusal ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {refusable.refusal}
        </p>
      ) : null}
    </div>
  );
}

export function DealOverflowMenu(props: {
  dealId: string;
  dealName: string;
  dealsHref: string;
  starred: boolean;
  listingStatus: string;
  basis: EarningsBasis;
  archived: boolean;
  isOwner: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [starPending, startStarTransition] = useTransition();
  const refusable = useRefusableAction();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [rerunOpen, setRerunOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState(LOST_REASONS[0]!.value);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={'outline'}
            size={'sm'}
            aria-label={'More deal actions'}
            disabled={starPending || refusable.pending}
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={'end'} className={'w-52'}>
          <DropdownMenuItem
            onSelect={() =>
              startStarTransition(async () => {
                await (props.starred
                  ? unstarDeal({ deal_id: props.dealId })
                  : starDeal({ deal_id: props.dealId }));
                router.refresh();
              })
            }
          >
            {props.starred ? 'Unstar' : 'Star'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <ManagersOnly allowed={props.canManage} label={'Listing status'}>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Listing status</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={props.listingStatus}
                  onValueChange={(value) =>
                    refusable.run(() =>
                      setDealListingStatus({
                        deal_id: props.dealId,
                        listing_status: value as ListingStatus,
                      }),
                    )
                  }
                >
                  {LISTING_STATUSES.map((status) => (
                    <DropdownMenuRadioItem
                      key={status.value}
                      value={status.value}
                    >
                      {status.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </ManagersOnly>
          <ManagersOnly allowed={props.canManage} label={'Earnings basis'}>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Earnings basis</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={props.basis}
                  onValueChange={(value) =>
                    refusable.run(() =>
                      setEarningsBasis({
                        deal_id: props.dealId,
                        earnings_basis: value as EarningsBasis,
                      }),
                    )
                  }
                >
                  {EARNINGS_BASES.map((basis) => (
                    <DropdownMenuRadioItem
                      key={basis.value}
                      value={basis.value}
                    >
                      {basis.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </ManagersOnly>
          <ManagersOnly allowed={props.canManage} label={'Re-extract with AI'}>
            <DropdownMenuItem onSelect={() => setRerunOpen(true)}>
              Re-extract with AI
            </DropdownMenuItem>
          </ManagersOnly>
          <DropdownMenuSeparator />
          <ManagersOnly allowed={props.canManage} label={'Mark won'}>
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
          </ManagersOnly>
          <ManagersOnly allowed={props.canManage} label={'Mark lost'}>
            <DropdownMenuItem onSelect={() => setLostOpen(true)}>
              Mark lost
            </DropdownMenuItem>
          </ManagersOnly>
          <DropdownMenuSeparator />
          <ManagersOnly
            allowed={props.canManage}
            label={props.archived ? 'Unarchive' : 'Archive'}
          >
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
          </ManagersOnly>
          {props.archived && props.isOwner ? (
            <DropdownMenuItem
              variant={'destructive'}
              onSelect={() => setDeleteOpen(true)}
            >
              Delete
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <DealIntakeRerun
        dealId={props.dealId}
        open={rerunOpen}
        onOpenChange={setRerunOpen}
      />

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
    </>
  );
}
