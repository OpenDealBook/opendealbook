import type {
  ReconciliationFinding,
  ReconciliationLinks,
  ReconciliationSeverity,
} from './contract';

export interface SeverityBands {
  info: number;
  warning: number;
}

export interface ReconcileArgs {
  checkKey: string;
  period: string;
  actual: number | null;
  expected: number | null;
  bands: SeverityBands;
  links: ReconciliationLinks;
}

function band(deltaPct: number, bands: SeverityBands): ReconciliationSeverity {
  if (deltaPct <= bands.info) return 'info';
  if (deltaPct <= bands.warning) return 'warning';
  return 'error';
}

export function reconcile(args: ReconcileArgs): ReconciliationFinding[] {
  const { checkKey, period, actual, expected, bands, links } = args;

  if (actual === null || expected === null || expected <= 0) {
    return [
      {
        checkKey,
        severity: 'error',
        status: 'missing',
        detail: { period, expected, actual, deltaPct: null },
        links,
      },
    ];
  }

  const deltaPct = Math.abs(actual - expected) / expected;
  const severity = band(deltaPct, bands);

  return [
    {
      checkKey,
      severity,
      status: severity === 'info' ? 'reconciled' : 'discrepancy',
      detail: { period, expected, actual, deltaPct },
      links,
    },
  ];
}
