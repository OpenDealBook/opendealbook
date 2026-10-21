import { z } from 'zod';

import type { Json, Tables } from '@odb/supabase';

import { type AdoptedYear, adoptedYearSchema } from '../schema/deal.schema';

export interface AdoptedFigures {
  revenue: number | null;
  sde: number | null;
  ebitda: number | null;
  years: AdoptedYear[] | null;
}

const wholeDollars = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

const adoptableSnapshotSchema = z.object({
  adopt: z.object({
    revenue: z.number().nullable(),
    sde: z.number().nullable(),
    ebitda: z.number().nullable(),
    years: adoptedYearSchema.array().optional(),
  }),
});

export function outputsSaved(outputsSnapshot: Json): boolean {
  return Object.keys(outputsSnapshot as object).length > 0;
}

export function figuresToAdopt(outputsSnapshot: Json): AdoptedFigures {
  const { adopt } = adoptableSnapshotSchema.parse(outputsSnapshot);

  return {
    revenue: adopt.revenue,
    sde: adopt.sde,
    ebitda: adopt.ebitda,
    years: adopt.years ?? null,
  };
}

export function adoptedFiguresOf(
  financials: Pick<
    Tables<'deal_financials'>,
    'adopted_revenue' | 'adopted_sde' | 'adopted_ebitda' | 'adopted_years'
  >,
): AdoptedFigures {
  return {
    revenue: financials.adopted_revenue,
    sde: financials.adopted_sde,
    ebitda: financials.adopted_ebitda,
    years: adoptedYearSchema.array().nullable().parse(financials.adopted_years),
  };
}

export function multipleText(value: number): string {
  return `${value.toFixed(2)}x`;
}

function money(value: number | null): string {
  return value === null ? '' : wholeDollars.format(value);
}

function asShown(figures: AdoptedFigures): string {
  return [
    money(figures.revenue),
    money(figures.sde),
    money(figures.ebitda),
    ...(figures.years ?? []).flatMap((year) => [
      String(year.year),
      money(year.debt_service),
      year.dscr === null ? '' : multipleText(year.dscr),
      money(year.net_cash_flow),
    ]),
  ].join('|');
}

export function primaryCalcChanged(
  adopted: AdoptedFigures,
  primaryOutputsSnapshot: Json,
): boolean {
  return (
    outputsSaved(primaryOutputsSnapshot) &&
    asShown(adopted) !== asShown(figuresToAdopt(primaryOutputsSnapshot))
  );
}
