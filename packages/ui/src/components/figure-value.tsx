import {
  MISSING_FIGURE,
  formatMoney,
  formatMoneyExact,
  formatMonths,
  formatMultiple,
  formatPercent,
  formatRatio,
} from '#lib/format';
import { cn } from '#lib/utils';

export type FigureFormat =
  | 'money'
  | 'multiple'
  | 'ratio'
  | 'percent'
  | 'months';

const FORMATS: Record<
  FigureFormat,
  { shown: (value: number) => string; exact?: (value: number) => string }
> = {
  money: { shown: formatMoney, exact: formatMoneyExact },
  multiple: { shown: formatMultiple },
  ratio: { shown: formatRatio },
  percent: { shown: formatPercent },
  months: { shown: formatMonths },
};

function MissingValue({
  calculated = false,
  label = calculated ? 'Not available' : 'Not disclosed',
  className,
}: {
  calculated?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <span
      data-slot="missing-value"
      title={label}
      aria-label={label}
      className={cn('text-muted-foreground', className)}
    >
      {MISSING_FIGURE}
    </span>
  );
}

function FigureValue({
  value,
  format,
  missingLabel,
  calculated = false,
  className,
}: {
  value: number | null;
  format: FigureFormat;
  missingLabel?: string;
  calculated?: boolean;
  className?: string;
}) {
  if (value === null) {
    return (
      <MissingValue
        calculated={calculated}
        label={missingLabel}
        className={className}
      />
    );
  }

  const { shown, exact } = FORMATS[format];

  return (
    <span
      data-slot="figure-value"
      title={exact?.(value)}
      className={cn('tabular-nums', className)}
    >
      {shown(value)}
    </span>
  );
}

export { FigureValue, MissingValue };
