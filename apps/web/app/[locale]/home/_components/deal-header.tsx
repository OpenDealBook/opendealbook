'use client';

import type { ReactNode } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { earningsMargin, earningsMultiple } from '@odb/calculators';
import { dealDisplayName } from '@odb/deals/shared';
import type { Tables } from '@odb/supabase';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import { FigureValue } from '@odb/ui/figure-value';

import { DealOverflowMenu, DealStageSelect } from './deal-detail-actions';
import { DealProfileDialog, type ProfileDeal } from './deal-profile-form';
import { GatedControl } from './gated-control';

const LISTING_MARKS: Partial<Record<string, string>> = {
  pulled: 'Pulled',
  sold: 'Sold',
};

const MANAGERS_ONLY =
  'Only deal managers can change the stage, listing, earnings basis or outcome, archive the deal, or re-extract it.';

function resolutionText(
  resolution: string | null,
  reason: string | null,
): string {
  if (resolution === null) {
    return 'Open';
  }
  const outcome = resolution === 'won' ? 'Won' : 'Lost';
  return reason === null
    ? outcome
    : `${outcome} (${reason.replace(/_/g, ' ')})`;
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={'flex min-w-0 flex-col gap-1'}>
      <dt className={'text-muted-foreground text-xs'}>{label}</dt>
      <dd className={'text-2xl font-medium tracking-tight'}>{children}</dd>
    </div>
  );
}

export function DealHeader({
  deal,
  financials,
  stages,
  starred,
  canManage,
  isOwner,
  dealsHref,
  industries,
  otherBusinessNames,
  tabs,
}: {
  deal: Pick<
    Tables<'deal'>,
    | 'id'
    | 'description'
    | 'code_name'
    | 'stage'
    | 'capture_method'
    | 'resolution'
    | 'resolution_reason'
    | 'listing_status'
    | 'archived_at'
    | 'asking_price'
    | 'revenue_ttm'
    | 'sde_ttm'
    | 'ebitda_ttm'
    | 'earnings_basis'
  > & {
    firm: { name: string; name_confirmed: boolean };
    deal_profile: ProfileDeal['deal_profile'];
  };
  financials: Pick<
    Tables<'deal_financials'>,
    'adopted_revenue' | 'adopted_sde' | 'adopted_ebitda'
  > | null;
  stages: { key: string; label: string }[];
  starred: boolean;
  canManage: boolean;
  isOwner: boolean;
  dealsHref: string;
  industries: { id: string; name: string }[];
  otherBusinessNames: string[];
  tabs: ReactNode;
}) {
  const asking = deal.asking_price;
  const { revenue, sde, ebitda } =
    financials === null
      ? {
          revenue: deal.revenue_ttm,
          sde: deal.sde_ttm,
          ebitda: deal.ebitda_ttm,
        }
      : {
          revenue: financials.adopted_revenue,
          sde: financials.adopted_sde,
          ebitda: financials.adopted_ebitda,
        };
  const basis = deal.earnings_basis === 'ebitda' ? 'ebitda' : 'sde';
  const earningsLabel = basis === 'ebitda' ? 'EBITDA' : 'SDE';
  const multiple = earningsMultiple(basis, asking, sde, ebitda);
  const margin = earningsMargin(basis, revenue, sde, ebitda);
  const listingMark = LISTING_MARKS[deal.listing_status];
  const onOverview = usePathname().endsWith(`/deals/${deal.id}`);

  return (
    <header className={'contents'}>
      <div
        className={
          'bg-background sticky top-0 z-20 flex h-14 min-w-0 items-center gap-2 px-4 md:px-8'
        }
      >
        <Link
          href={dealsHref}
          className={
            'text-muted-foreground hover:text-foreground shrink-0 text-sm'
          }
        >
          Deals
        </Link>
        <span aria-hidden className={'text-muted-foreground'}>
          /
        </span>
        <h1 className={'truncate font-serif text-2xl font-medium'}>
          {dealDisplayName(deal)}
        </h1>
      </div>
      <div className={'flex flex-col gap-4 px-4 pb-4 md:px-8'}>
        <div className={'flex flex-wrap items-start justify-between gap-3'}>
          <div className={'flex flex-wrap items-center gap-2'}>
            {deal.code_name === null ? null : (
              <Badge variant={'secondary'} title={'Code name'}>
                {deal.code_name}
              </Badge>
            )}
            {deal.capture_method === 'example' ? (
              <Badge variant={'secondary'}>Example</Badge>
            ) : null}
            <Badge variant={'outline'}>
              {resolutionText(deal.resolution, deal.resolution_reason)}
            </Badge>
          </div>
          <div className={'flex flex-wrap items-start gap-2'}>
            <GatedControl allowed={canManage} reason={MANAGERS_ONLY}>
              <DealStageSelect
                dealId={deal.id}
                stage={deal.stage}
                stages={stages}
              />
            </GatedControl>
            {listingMark === undefined ? null : (
              <Badge
                variant={'outline'}
                className={'text-muted-foreground self-center'}
              >
                {listingMark}
              </Badge>
            )}
            <DealProfileDialog
              trigger={
                <Button variant={'outline'} size={'sm'}>
                  Deal profile
                </Button>
              }
              deal={deal}
              industries={industries}
              otherBusinessNames={otherBusinessNames}
              canManage={canManage}
            />
            <DealOverflowMenu
              dealId={deal.id}
              dealName={dealDisplayName(deal)}
              dealsHref={dealsHref}
              starred={starred}
              listingStatus={deal.listing_status}
              basis={basis}
              archived={deal.archived_at !== null}
              isOwner={isOwner}
              canManage={canManage}
            />
          </div>
        </div>
        {deal.firm.name_confirmed ? null : (
          <div
            className={
              'bg-warning/10 text-warning flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2 text-sm'
            }
          >
            <span>This name was guessed from the description.</span>
            <DealProfileDialog
              trigger={
                <Button variant={'outline'} size={'sm'}>
                  Confirm business name
                </Button>
              }
              deal={deal}
              industries={industries}
              otherBusinessNames={otherBusinessNames}
              canManage={canManage}
            />
          </div>
        )}
        {onOverview ? null : (
          <dl
            className={
              'grid grid-cols-2 gap-x-8 gap-y-4 border-t pt-4 sm:grid-cols-5'
            }
          >
            <Figure label={'Asking'}>
              <FigureValue value={asking} format={'money'} />
            </Figure>
            <Figure label={'Revenue'}>
              <FigureValue value={revenue} format={'money'} />
            </Figure>
            <Figure label={earningsLabel}>
              <FigureValue
                value={basis === 'ebitda' ? ebitda : sde}
                format={'money'}
              />
            </Figure>
            <Figure label={`Asking multiple (${earningsLabel})`}>
              <FigureValue value={multiple} format={'multiple'} calculated />
            </Figure>
            <Figure label={`${earningsLabel} margin`}>
              <FigureValue value={margin} format={'percent'} calculated />
            </Figure>
          </dl>
        )}
      </div>
      <div
        className={
          'bg-background sticky top-14 z-20 border-b px-4 pt-2 md:px-8'
        }
      >
        {tabs}
      </div>
    </header>
  );
}
