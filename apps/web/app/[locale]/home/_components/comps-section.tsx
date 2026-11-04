import { getLocale } from 'next-intl/server';

import { getSupabaseServerClient } from '@odb/supabase/server';
import { Badge } from '@odb/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { FigureValue, MissingValue } from '@odb/ui/figure-value';
import { formatDate, formatMultiple, formatPercent } from '@odb/ui/format';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

const RELEVANT_LIMIT = 12;
const BENCHMARK_LIMIT = 12;

function textOrNotSet(value: string | number | null): string {
  return value === null ? 'Not set' : String(value);
}

function DateOrNotSet(props: { value: string | null; locale: string }) {
  return props.value === null ? (
    <MissingValue label={'Not set'} />
  ) : (
    formatDate(props.value, props.locale)
  );
}

interface CompRow {
  key: string;
  attribution: string;
  dataClass: string;
  price: number | null;
  priceBasis: string | null;
  confidence: string | null;
  naics: string | null;
  date: string | null;
}

function bandCount(n: number): string {
  if (n < 25) {
    return 'fewer than 25';
  }
  if (n < 50) {
    return '25 to 50';
  }
  if (n < 100) {
    return '50 to 100';
  }
  return '100 or more';
}

interface Expectations {
  multipleLow: number | null;
  multipleHigh: number | null;
  closeToAsking: number | null;
  count: number;
}

function deriveExpectations(
  pool: { n: number | null; median_sde_multiple: number | null }[],
  activity: {
    median_asking_price: number | null;
    median_loi_price: number | null;
  }[],
): Expectations {
  const multiples = pool
    .map((row) => row.median_sde_multiple)
    .filter((value): value is number => value !== null);

  let askingTotal = 0;
  let loiTotal = 0;
  for (const row of activity) {
    if (row.median_asking_price !== null && row.median_loi_price !== null) {
      askingTotal += row.median_asking_price;
      loiTotal += row.median_loi_price;
    }
  }

  return {
    multipleLow: multiples.length === 0 ? null : Math.min(...multiples),
    multipleHigh: multiples.length === 0 ? null : Math.max(...multiples),
    closeToAsking: askingTotal === 0 ? null : loiTotal / askingTotal,
    count: pool.reduce((total, row) => total + (row.n ?? 0), 0),
  };
}

export async function CompsSection(props: {
  dealId: string;
  accountId: string;
}) {
  const client = getSupabaseServerClient();
  const locale = await getLocale();

  const profileResult = await client
    .from('deal_profile')
    .select('industry(name)')
    .eq('deal_id', props.dealId)
    .maybeSingle();

  const industryName = profileResult.data?.industry?.name ?? null;

  let externalQuery = client
    .from('comp_external')
    .select(
      'id, source, naics_code, industry, close_date, created_at, asking_price, sale_price',
    )
    .order('close_date', { ascending: false, nullsFirst: false })
    .limit(RELEVANT_LIMIT);

  let internalQuery = client
    .from('comp')
    .select(
      'id, data_class, source, source_label, price_basis, confidence, naics_code, industry, close_date, created_at, asking_price, sale_price',
    )
    .eq('account_id', props.accountId)
    .order('close_date', { ascending: false, nullsFirst: false })
    .limit(RELEVANT_LIMIT);

  let benchmarkQuery = client
    .from('benchmark')
    .select(
      'id, metric, low, median, high, source_citation, as_of, naics_code, industry',
    )
    .order('as_of', { ascending: false, nullsFirst: false })
    .limit(BENCHMARK_LIMIT);

  if (industryName !== null) {
    externalQuery = externalQuery.ilike('industry', industryName);
    internalQuery = internalQuery.ilike('industry', industryName);
    benchmarkQuery = benchmarkQuery.ilike('industry', industryName);
  }

  const [
    externalResult,
    internalResult,
    benchmarkResult,
    poolResult,
    activityResult,
  ] = await Promise.all([
    externalQuery,
    internalQuery,
    benchmarkQuery,
    client
      .from('comp_pool_public')
      .select('n, median_sde_multiple, median_sale_price'),
    client
      .from('activity_pool_public')
      .select('n, median_asking_price, median_loi_price'),
  ]);

  const external = externalResult.data ?? [];
  const internal = internalResult.data ?? [];
  const benchmarks = benchmarkResult.data ?? [];
  const expectations = deriveExpectations(
    poolResult.data ?? [],
    activityResult.data ?? [],
  );

  const comps: CompRow[] = [
    ...external.map(
      (row, index): CompRow => ({
        key: row.id ?? `external-${index}`,
        attribution: textOrNotSet(row.source),
        dataClass: 'external',
        price: row.sale_price ?? row.asking_price,
        priceBasis: null,
        confidence: null,
        naics: row.naics_code,
        date: row.close_date ?? row.created_at,
      }),
    ),
    ...internal.map(
      (row): CompRow => ({
        key: row.id,
        attribution: row.source_label ?? row.source,
        dataClass: row.data_class,
        price: row.sale_price ?? row.asking_price,
        priceBasis: row.price_basis,
        confidence: row.confidence,
        naics: row.naics_code,
        date: row.close_date ?? row.created_at,
      }),
    ),
  ]
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    .slice(0, RELEVANT_LIMIT);

  const poolReady =
    expectations.multipleLow !== null || expectations.closeToAsking !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comparables</CardTitle>
      </CardHeader>
      <CardContent className={'flex flex-col gap-6'}>
        <div className={'flex flex-col gap-2'}>
          <h4 className={'text-sm font-medium'}>Relevant comps</h4>
          {comps.length === 0 ? (
            <p className={'text-muted-foreground text-sm'}>
              No comparable transactions yet
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead numeric>Price</TableHead>
                  <TableHead>Basis</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>NAICS</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comps.map((comp) => (
                  <TableRow key={comp.key}>
                    <TableCell>{comp.attribution}</TableCell>
                    <TableCell>
                      <Badge variant={'outline'}>{comp.dataClass}</Badge>
                    </TableCell>
                    <TableCell numeric>
                      <FigureValue value={comp.price} format={'money'} />
                    </TableCell>
                    <TableCell>{textOrNotSet(comp.priceBasis)}</TableCell>
                    <TableCell>{textOrNotSet(comp.confidence)}</TableCell>
                    <TableCell>{textOrNotSet(comp.naics)}</TableCell>
                    <TableCell>
                      <DateOrNotSet value={comp.date} locale={locale} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className={'flex flex-col gap-2'}>
          <h4 className={'text-sm font-medium'}>Benchmarks</h4>
          {benchmarks.length === 0 ? (
            <p className={'text-muted-foreground text-sm'}>
              No benchmarks for this vertical
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead numeric>Low</TableHead>
                  <TableHead numeric>Median</TableHead>
                  <TableHead numeric>High</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>As of</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {benchmarks.map((benchmark) => (
                  <TableRow key={benchmark.id}>
                    <TableCell>{benchmark.metric}</TableCell>
                    <TableCell numeric>
                      <FigureValue
                        value={benchmark.low}
                        format={'multiple'}
                        missingLabel={'Not set'}
                      />
                    </TableCell>
                    <TableCell numeric>
                      <FigureValue
                        value={benchmark.median}
                        format={'multiple'}
                        missingLabel={'Not set'}
                      />
                    </TableCell>
                    <TableCell numeric>
                      <FigureValue
                        value={benchmark.high}
                        format={'multiple'}
                        missingLabel={'Not set'}
                      />
                    </TableCell>
                    <TableCell>
                      {textOrNotSet(benchmark.source_citation)}
                    </TableCell>
                    <TableCell>
                      <DateOrNotSet value={benchmark.as_of} locale={locale} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className={'flex flex-col gap-2'}>
          <h4 className={'text-sm font-medium'}>What to expect</h4>
          {!poolReady ? (
            <p className={'text-muted-foreground text-sm'}>
              Not enough data yet
            </p>
          ) : (
            <dl className={'grid grid-cols-2 gap-4 sm:grid-cols-3'}>
              <div className={'flex flex-col gap-0.5'}>
                <dt className={'text-muted-foreground text-xs uppercase'}>
                  Typical SDE multiple
                </dt>
                <dd className={'text-sm'}>
                  {expectations.multipleLow === null
                    ? 'Not set'
                    : `${formatMultiple(expectations.multipleLow)} to ${formatMultiple(expectations.multipleHigh!)}`}
                </dd>
              </div>
              <div className={'flex flex-col gap-0.5'}>
                <dt className={'text-muted-foreground text-xs uppercase'}>
                  Close vs asking
                </dt>
                <dd className={'text-sm'}>
                  {expectations.closeToAsking === null
                    ? 'Not set'
                    : `${formatPercent(expectations.closeToAsking)} of asking`}
                </dd>
              </div>
              <div className={'flex flex-col gap-0.5'}>
                <dt className={'text-muted-foreground text-xs uppercase'}>
                  Pool size
                </dt>
                <dd className={'text-sm'}>{bandCount(expectations.count)}</dd>
              </div>
            </dl>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
