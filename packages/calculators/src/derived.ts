const DAY_MS = 86_400_000;

function ratio(
  numerator: number | null,
  denominator: number | null,
): number | null {
  if (
    numerator === null ||
    numerator === 0 ||
    denominator === null ||
    denominator === 0
  ) {
    return null;
  }
  return numerator / denominator;
}

function daysBetween(from: string | null, to: string | null): number | null {
  if (from === null || to === null) {
    return null;
  }
  return Math.floor((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

export function revenueMultiple(
  asking: number | null,
  revenue: number | null,
): number | null {
  return ratio(asking, revenue);
}

export function sdeMultiple(
  asking: number | null,
  adoptedSde: number | null,
): number | null {
  return ratio(asking, adoptedSde);
}

export function sdeMargin(
  sde: number | null,
  revenue: number | null,
): number | null {
  return ratio(sde, revenue);
}

export type EarningsBasis = 'sde' | 'ebitda';

function earningsValue(
  basis: EarningsBasis,
  sde: number | null,
  ebitda: number | null,
): number | null {
  return basis === 'ebitda' ? ebitda : sde;
}

export function earningsMultiple(
  basis: EarningsBasis,
  asking: number | null,
  sde: number | null,
  ebitda: number | null,
): number | null {
  return ratio(asking, earningsValue(basis, sde, ebitda));
}

export function earningsMargin(
  basis: EarningsBasis,
  revenue: number | null,
  sde: number | null,
  ebitda: number | null,
): number | null {
  return ratio(earningsValue(basis, sde, ebitda), revenue);
}

export function multipleOnOffer(
  offer: number | null,
  sde: number | null,
): number | null {
  return ratio(offer, sde);
}

export function offerVsAskingPct(
  offer: number | null,
  asking: number | null,
): number | null {
  const fraction = ratio(offer, asking);
  return fraction === null ? null : fraction * 100;
}

export function daysInStage(
  stageEnteredAt: string | null,
  now: string | null,
): number | null {
  return daysBetween(stageEnteredAt, now);
}

export function dealAge(
  createdAt: string | null,
  now: string | null,
): number | null {
  return daysBetween(createdAt, now);
}
