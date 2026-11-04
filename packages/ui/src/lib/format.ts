export const MISSING_FIGURE = '–';

const compactMoney = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 2,
});

const exactMoney = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  currencySign: 'accounting',
  maximumFractionDigits: 0,
});

const oneDecimal = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const twoDecimals = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percent = new Intl.NumberFormat('en-US', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatMoney(value: number): string {
  const shown = compactMoney.format(Math.abs(value));
  return value < 0 ? `(${shown})` : shown;
}

export function formatMoneyExact(value: number): string {
  return exactMoney.format(value);
}

export function formatMultiple(value: number): string {
  return `${oneDecimal.format(value)}x`;
}

export function formatRatio(value: number): string {
  return `${twoDecimals.format(value)}x`;
}

export function formatMonths(value: number): string {
  return `${oneDecimal.format(value)} mo`;
}

export function formatPercent(fraction: number): string {
  return percent.format(fraction);
}

export function formatDate(iso: string, locale: string): string {
  return formatTimestamp(iso, locale, 'UTC');
}

export function formatTimestamp(
  iso: string,
  locale: string,
  timeZone: string,
): string {
  return new Date(iso).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone,
  });
}

export function formatRatioGap(value: number): string {
  const shown = formatRatio(Math.abs(value));
  return value < 0 ? `(${shown})` : `+${shown}`;
}

export function formatMonth(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

const upToOneDecimal = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
});

export function formatBytes(bytes: number): string {
  const exponent = Math.min(
    Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)),
    BYTE_UNITS.length - 1,
  );

  return `${upToOneDecimal.format(bytes / 1024 ** exponent)} ${BYTE_UNITS[exponent]}`;
}
