'use client';

import { Badge } from '@odb/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { FigureValue, MissingValue } from '@odb/ui/figure-value';
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

export function AdminCompsPool() {
  const { data, isPending } = useAdminCompsPool();

  if (isPending) {
    return <Spinner />;
  }

  const {
    minBucket,
    compBuckets,
    activityBuckets,
    externalComps,
    optInActive,
  } = data!;
  const closed = summarizeBuckets(compBuckets);
  const activity = summarizeBuckets(activityBuckets);

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
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
                <TableHead numeric>n</TableHead>
                <TableHead numeric>Median SDE multiple</TableHead>
                <TableHead numeric>Median sale price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {compBuckets.map((bucket, index) => (
                <TableRow key={index}>
                  <TableCell>{bucket.region ?? <MissingValue />}</TableCell>
                  <TableCell>{bucket.naics3 ?? <MissingValue />}</TableCell>
                  <TableCell>
                    {bucket.close_quarter ?? <MissingValue />}
                  </TableCell>
                  <TableCell numeric>
                    <Badge variant="outline">{bucket.n}</Badge>
                  </TableCell>
                  <TableCell numeric>
                    <FigureValue
                      calculated
                      value={bucket.median_sde_multiple}
                      format={'multiple'}
                    />
                  </TableCell>
                  <TableCell numeric>
                    <FigureValue
                      calculated
                      value={bucket.median_sale_price}
                      format={'money'}
                    />
                  </TableCell>
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
                <TableHead numeric>n</TableHead>
                <TableHead numeric>Median asking</TableHead>
                <TableHead numeric>Median LOI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activityBuckets.map((bucket, index) => (
                <TableRow key={index}>
                  <TableCell>{bucket.region ?? <MissingValue />}</TableCell>
                  <TableCell>{bucket.naics3 ?? <MissingValue />}</TableCell>
                  <TableCell>
                    {bucket.created_quarter ?? <MissingValue />}
                  </TableCell>
                  <TableCell>{bucket.outcome ?? <MissingValue />}</TableCell>
                  <TableCell numeric>
                    <Badge variant="outline">{bucket.n}</Badge>
                  </TableCell>
                  <TableCell numeric>
                    <FigureValue
                      calculated
                      value={bucket.median_asking_price}
                      format={'money'}
                    />
                  </TableCell>
                  <TableCell numeric>
                    <FigureValue
                      calculated
                      value={bucket.median_loi_price}
                      format={'money'}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
