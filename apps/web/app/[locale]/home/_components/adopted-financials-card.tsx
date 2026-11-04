import { getLocale } from 'next-intl/server';

import {
  type AdoptedFigures,
  adoptedFiguresOf,
  primaryCalcChanged,
} from '@odb/deals/shared';
import { whomToAsk } from '@odb/next/actions/refusable-action';
import type { Tables } from '@odb/supabase';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { FigureValue } from '@odb/ui/figure-value';
import { formatTimestamp } from '@odb/ui/format';

import { AdoptedYears } from './adopted-years';
import { type NamedVersion, versionName } from './calc-version-name';
import { GatedControl } from './gated-control';
import { ReadoptButton } from './readopt-button';
import { viewerTimeZone } from './viewer-time-zone';

function Figure({ label, value }: { label: string; value: number | null }) {
  return (
    <div className={'flex flex-col gap-0.5'}>
      <dt className={'text-muted-foreground text-xs uppercase'}>{label}</dt>
      <dd className={'text-sm'}>
        <FigureValue value={value} format={'money'} />
      </dd>
    </div>
  );
}

type Sibling = Pick<NamedVersion, 'id' | 'type' | 'created_at'>;

interface Adoption {
  dealId: string;
  adoptedAt: string;
  figures: AdoptedFigures;
}

interface PrimaryChanged {
  primaryCalcVersionId: string;
  canReadopt: boolean;
  askWhom: string;
}

async function primaryCalcChangedSinceAdoption(
  adoption: Adoption,
  sourceCalc: NamedVersion,
): Promise<PrimaryChanged | null> {
  const client = getSupabaseServerClient();
  const { data: primary } = await client
    .from('calc_version')
    .select('id, outputs_snapshot')
    .eq('deal_id', adoption.dealId)
    .eq('type', sourceCalc.type as string)
    .eq('is_primary', true)
    .maybeSingle()
    .throwOnError();

  if (
    primary === null ||
    !primaryCalcChanged(adoption.figures, primary.outputs_snapshot)
  ) {
    return null;
  }

  const [{ data: canReadopt }, askWhom] = await Promise.all([
    client
      .rpc('has_deal_permission', {
        deal_id: adoption.dealId,
        permission: 'deals.manage',
      })
      .throwOnError(),
    whomToAsk(adoption.dealId),
  ]);

  return {
    primaryCalcVersionId: primary.id,
    canReadopt,
    askWhom,
  };
}

async function calcsOfType(dealId: string, type: string): Promise<Sibling[]> {
  const { data } = await getSupabaseServerClient()
    .from('calc_version')
    .select('id, type, created_at')
    .eq('deal_id', dealId)
    .eq('type', type)
    .throwOnError();
  return data;
}

export async function AdoptedFinancialsCard(props: {
  accountId: string;
  financials: Pick<
    Tables<'deal_financials'>,
    | 'deal_id'
    | 'adopted_revenue'
    | 'adopted_sde'
    | 'adopted_ebitda'
    | 'adopted_at'
    | 'adopted_years'
  > | null;
  calc: NamedVersion | null;
  adoptedBy: string | null;
}) {
  const adoption =
    props.financials === null
      ? null
      : {
          dealId: props.financials.deal_id,
          adoptedAt: props.financials.adopted_at!,
          figures: adoptedFiguresOf(props.financials),
        };
  const [locale, timeZone] = await Promise.all([
    getLocale(),
    viewerTimeZone(props.accountId),
  ]);
  const [primaryChanged, versions] =
    adoption === null || props.calc === null
      ? [null, []]
      : await Promise.all([
          primaryCalcChangedSinceAdoption(adoption, props.calc),
          calcsOfType(adoption.dealId, props.calc.type as string),
        ]);

  return (
    <AdoptedFinancials
      adoption={adoption}
      calc={props.calc}
      versions={versions}
      adoptedBy={props.adoptedBy}
      primaryChanged={primaryChanged}
      locale={locale}
      timeZone={timeZone}
    />
  );
}

export function AdoptedFinancials({
  adoption,
  calc,
  versions,
  adoptedBy,
  primaryChanged,
  locale,
  timeZone,
}: {
  adoption: Adoption | null;
  calc: NamedVersion | null;
  versions: Sibling[];
  adoptedBy: string | null;
  primaryChanged: PrimaryChanged | null;
  locale: string;
  timeZone: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Adopted financials</CardTitle>
      </CardHeader>
      <CardContent className={'flex flex-col gap-4'}>
        {adoption === null ? (
          <p className={'text-muted-foreground text-sm'}>
            No financials adopted yet
          </p>
        ) : (
          <>
            <p className={'text-muted-foreground text-sm'}>
              {calc === null ? (
                'Adopted'
              ) : (
                <>From {versionName(calc, versions)}, adopted</>
              )}{' '}
              by {adoptedBy} on{' '}
              {formatTimestamp(adoption.adoptedAt, locale, timeZone)}
            </p>
            {primaryChanged === null ? null : (
              <div
                className={
                  'bg-warning/10 text-warning flex flex-col gap-2 rounded-md px-3 py-2 text-sm'
                }
              >
                <span>Primary calc changed since adoption</span>
                <GatedControl
                  allowed={primaryChanged.canReadopt}
                  reason={`Only deal managers can re-adopt. Ask ${primaryChanged.askWhom}.`}
                >
                  <ReadoptButton
                    dealId={adoption.dealId}
                    primaryCalcVersionId={primaryChanged.primaryCalcVersionId}
                  />
                </GatedControl>
              </div>
            )}
            <dl className={'grid grid-cols-2 gap-4 sm:grid-cols-3'}>
              <Figure label={'Revenue'} value={adoption.figures.revenue} />
              <Figure label={'SDE'} value={adoption.figures.sde} />
              <Figure label={'EBITDA'} value={adoption.figures.ebitda} />
            </dl>
            {adoption.figures.years === null ? null : (
              <AdoptedYears years={adoption.figures.years} />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
