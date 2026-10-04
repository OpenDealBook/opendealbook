'use client';

import { Badge } from '@odb/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { Spinner } from '@odb/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import { useAdminCompsPool } from '../hooks/use-admin-insights';
import { summarizeBuckets } from '../lib/comps-summary';

function formatMoney(value: number | null) {
  return value === null ? '—' : `$${Math.round(value).toLocaleString()}`;
}

function formatMultiple(value: number | null) {
  return value === null ? '—' : `${value.toFixed(2)}x`;
}

export function AdminCompsPool() {
  const { data, isPending } = useAdminCompsPool();

  if (isPending) {
    return <Spinner />;
  }

  const { minBucket, compBuckets, activityBuckets, externalComps, optInActive } =
    data!;
  const closed = summarizeBuckets(compBuckets);
  const activity = summarizeBuckets(activityBuckets);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Buckets below the k-anonymity minimum of {minBucket} are hidden, and
        only coarse region and NAICS-3 dimensions are shown. Proprietary and
        internal comparables never appear here.
      </p>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Closed-deal buckets</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {closed.buckets}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pooled closes shown</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {closed.contributions}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">External comparables</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {externalComps}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Accounts opted in</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {optInActive}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Closed-deal pool</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Region</TableHead>
                <TableHead>NAICS-3</TableHead>
                <TableHead>Quarter</TableHead>
                <TableHead>n</TableHead>
                <TableHead>Median SDE multiple</TableHead>
                <TableHead>Median sale price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {compBuckets.map((bucket, index) => (
                <TableRow key={index}>
                  <TableCell>{bucket.region ?? '—'}</TableCell>
                  <TableCell>{bucket.naics3 ?? '—'}</TableCell>
                  <TableCell>{bucket.close_quarter ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{bucket.n}</Badge>
                  </TableCell>
                  <TableCell>
                    {formatMultiple(bucket.median_sde_multiple)}
                  </TableCell>
                  <TableCell>{formatMoney(bucket.median_sale_price)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity pool ({activity.contributions} shown)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Region</TableHead>
                <TableHead>NAICS-3</TableHead>
                <TableHead>Quarter</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>n</TableHead>
                <TableHead>Median asking</TableHead>
                <TableHead>Median LOI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activityBuckets.map((bucket, index) => (
                <TableRow key={index}>
                  <TableCell>{bucket.region ?? '—'}</TableCell>
                  <TableCell>{bucket.naics3 ?? '—'}</TableCell>
                  <TableCell>{bucket.created_quarter ?? '—'}</TableCell>
                  <TableCell>{bucket.outcome ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{bucket.n}</Badge>
                  </TableCell>
                  <TableCell>{formatMoney(bucket.median_asking_price)}</TableCell>
                  <TableCell>{formatMoney(bucket.median_loi_price)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
