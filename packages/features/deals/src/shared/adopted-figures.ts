import { z } from 'zod';

import type { Json, Tables } from '@odb/supabase';

import { type AdoptedYear, adoptedYearSchema } from '../schema/deal.schema';

export interface AdoptedFigures {
  revenue: number | null;
  sde: number | null;
  ebitda: number | null;
  years: AdoptedYear[] | null;
}

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

function wholeDollars(value: number | null): string {
  return value === null ? '' : String(Math.round(value));
}

function asShown(figures: AdoptedFigures): string {
  return [
    wholeDollars(figures.revenue),
    wholeDollars(figures.sde),
    wholeDollars(figures.ebitda),
    ...(figures.years ?? []).flatMap((year) => [
      String(year.year),
      wholeDollars(year.debt_service),
      year.dscr === null ? '' : year.dscr.toFixed(2),
      wholeDollars(year.net_cash_flow),
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
