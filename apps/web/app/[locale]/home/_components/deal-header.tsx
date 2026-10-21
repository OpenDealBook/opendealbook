'use client';

import type { ReactNode } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { earningsMargin, earningsMultiple } from '@odb/calculators';
import { dealDisplayName, multipleText } from '@odb/deals/shared';
import type { Tables } from '@odb/supabase';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';

import { DealHeaderActions, DealStarButton } from './deal-detail-actions';
import { DealIntakeRerun } from './deal-intake-rerun';
import { DealProfileDialog, type ProfileDeal } from './deal-profile-form';
import { EarningsBasisToggle } from './earnings-basis-toggle';
import { GatedControl } from './gated-control';

const MANAGERS_ONLY =
  'Only deal managers can change the stage, listing, earnings basis or outcome, archive the deal, or re-extract it.';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function money(value: number | null): string {
  return value === null ? 'Not disclosed' : currency.format(value);
}

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

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className={'flex flex-col'}>
      <dt className={'text-muted-foreground text-xs'}>{label}</dt>
      <dd className={'text-sm font-medium tabular-nums'}>{value}</dd>
    </div>
  );
}

export function DealHeader({
  deal,
  financials,
  stages,
  starred,
  canManage,
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
        <h1 className={'truncate text-xl font-semibold md:text-2xl'}>
          {dealDisplayName(deal)}
        </h1>
      </div>
      <div className={'flex flex-col gap-3 px-4 pb-3 md:px-8'}>
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
          <dl className={'grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-5'}>
            <Figure label={'Asking'} value={money(asking)} />
            <Figure label={'Revenue'} value={money(revenue)} />
            <Figure
              label={earningsLabel}
              value={money(basis === 'ebitda' ? ebitda : sde)}
            />
            <Figure
              label={`Asking multiple (${earningsLabel})`}
              value={
                multiple === null ? 'Not disclosed' : multipleText(multiple)
              }
            />
            <Figure
              label={`${earningsLabel} margin`}
              value={
                margin === null
                  ? 'Not disclosed'
                  : `${Math.round(margin * 100)}%`
              }
            />
          </dl>
        )}
        <div className={'flex flex-wrap items-start gap-2'}>
          <DealStarButton dealId={deal.id} starred={starred} />
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
          <GatedControl allowed={canManage} reason={MANAGERS_ONLY}>
            <div className={'flex flex-wrap items-start gap-2'}>
              <DealHeaderActions
                dealId={deal.id}
                stage={deal.stage}
                stages={stages}
                listingStatus={deal.listing_status}
                archived={deal.archived_at !== null}
              />
              <EarningsBasisToggle dealId={deal.id} basis={basis} />
              <DealIntakeRerun dealId={deal.id} />
            </div>
          </GatedControl>
        </div>
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
