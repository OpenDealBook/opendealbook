import { type DealBoxScreenBreakdown, dealBoxScreen } from '@odb/deals';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Badge } from '@odb/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function dscrText(value: number): string {
  return `${value.toFixed(2)}x`;
}

function dscrGap(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}x`;
}

function moneyGap(value: number): string {
  return `${value >= 0 ? '+' : ''}${currency.format(value)}`;
}

function verdict(pass: boolean | null) {
  if (pass === null) {
    return <Badge variant={'outline'}>Not set</Badge>;
  }
  return (
    <Badge variant={pass ? 'default' : 'destructive'}>
      {pass ? 'Pass' : 'Fail'}
    </Badge>
  );
}

function ScreenRow({
  label,
  adopted,
  threshold,
  gap,
  pass,
}: {
  label: string;
  adopted: string;
  threshold: string;
  gap: string | null;
  pass: boolean | null;
}) {
  return (
    <div className={'flex flex-wrap items-baseline justify-between gap-2'}>
      <div className={'flex flex-col gap-0.5'}>
        <span className={'text-muted-foreground text-xs uppercase'}>{label}</span>
        <span className={'text-sm'}>
          {adopted} vs {threshold}
          {gap === null ? '' : ` (${gap})`}
        </span>
      </div>
      {verdict(pass)}
    </div>
  );
}

function ScreenBreakdown({ screen }: { screen: DealBoxScreenBreakdown }) {
  return (
    <div className={'flex flex-col gap-4'}>
      <ScreenRow
        label={'DSCR'}
        adopted={dscrText(screen.dscr)}
        threshold={
          screen.minDscr === null ? 'Not set' : `min ${dscrText(screen.minDscr)}`
        }
        gap={screen.minDscr === null ? null : dscrGap(screen.dscr - screen.minDscr)}
        pass={screen.dscrPass}
      />
      <ScreenRow
        label={'Personal cash flow'}
        adopted={currency.format(screen.netCashFlow)}
        threshold={
          screen.requiredPersonalCashFlow === null
            ? 'Not set'
            : `min ${currency.format(screen.requiredPersonalCashFlow)}`
        }
        gap={
          screen.requiredPersonalCashFlow === null
            ? null
            : moneyGap(screen.netCashFlow - screen.requiredPersonalCashFlow)
        }
        pass={screen.cashFlowPass}
      />
    </div>
  );
}

export async function ScreeningSection({ dealId }: { dealId: string }) {
  const client = getSupabaseServerClient();
  const screen = await dealBoxScreen(client, dealId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className={'flex items-center gap-2'}>
          Screening
          {screen.status === 'screened'
            ? verdict(screen.pass)
            : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {screen.status === 'no_financials' ? (
          <p className={'text-muted-foreground text-sm'}>
            Not enough data to screen; no adopted financials yet
          </p>
        ) : screen.status === 'no_criteria' ? (
          <p className={'text-muted-foreground text-sm'}>
            No screen configured; this account has not set deal box criteria
          </p>
        ) : (
          <ScreenBreakdown screen={screen} />
        )}
      </CardContent>
    </Card>
  );
}
