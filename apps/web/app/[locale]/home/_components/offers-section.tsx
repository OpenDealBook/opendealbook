import {
  type OfferTerms,
  dealBoxScreenPasses,
  diffOfferTerms,
  fetchDealOffer,
} from '@odb/deals';
import type { Tables } from '@odb/supabase';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Badge } from '@odb/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import { CreateOfferButton, OfferLifecycleActions } from './offer-editor';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function statusVariant(
  status: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'accepted') {
    return 'default';
  }
  if (status === 'rejected' || status === 'withdrawn' || status === 'expired') {
    return 'destructive';
  }
  return 'outline';
}

function termsSummary(terms: OfferTerms): string {
  const parts: string[] = [];
  if (terms.cash_at_close !== undefined) {
    parts.push(`${currency.format(terms.cash_at_close)} cash`);
  }
  if (terms.earnout !== undefined) {
    parts.push(`${currency.format(terms.earnout.amount)} earnout`);
  }
  if (terms.funding_sources !== undefined && terms.funding_sources.length > 0) {
    parts.push(`${terms.funding_sources.length} funding`);
  }
  if (terms.contingencies !== undefined && terms.contingencies.length > 0) {
    parts.push(`${terms.contingencies.length} contingencies`);
  }
  return parts.length === 0 ? '--' : parts.join(', ');
}

function diffCell(value: unknown): string {
  if (value === undefined) {
    return '--';
  }
  if (value === null || typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export async function OffersSection({ dealId }: { dealId: string; accountId: string }) {
  const client = getSupabaseServerClient();
  const offer = await fetchDealOffer(client, { deal_id: dealId });

  if (offer === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Offers</CardTitle>
        </CardHeader>
        <CardContent className={'flex flex-col items-start gap-3'}>
          <p className={'text-muted-foreground text-sm'}>No offer yet</p>
          <CreateOfferButton dealId={dealId} />
        </CardContent>
      </Card>
    );
  }

  const { versions, currentVersion } = offer;
  const maxNumber = versions.reduce(
    (highest, version) => Math.max(highest, version.number),
    0,
  );
  const previousVersion =
    currentVersion === null
      ? null
      : versions.find((version) => version.number === currentVersion.number - 1) ??
        null;

  const diff =
    currentVersion === null || previousVersion === null
      ? []
      : diffOfferTerms(
          previousVersion.terms as unknown as OfferTerms,
          currentVersion.terms as unknown as OfferTerms,
        );

  const { data: deal } = await client
    .from('deal')
    .select('stage')
    .eq('id', dealId)
    .single();

  const submitted = offer.offer.submitted_at !== null;
  const loiGatePassed =
    offer.offer.status === 'accepted' &&
    (await dealBoxScreenPasses(client, dealId));
  const loiAccepted = deal?.stage === 'loi_accepted';
  const isCurrent = (version: Tables<'offer_version'>) =>
    version.id === offer.offer.current_version_id;

  return (
    <Card>
      <CardHeader>
        <CardTitle className={'flex items-center gap-2'}>
          Offers
          <Badge variant={statusVariant(offer.offer.status)}>
            {offer.offer.status}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className={'flex flex-col gap-6'}>
        <OfferLifecycleActions
          offerId={offer.offer.id}
          status={offer.offer.status}
          dealId={dealId}
          nextNumber={maxNumber + 1}
          loiGatePassed={loiGatePassed}
          loiAccepted={loiAccepted}
        />

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Side</TableHead>
              <TableHead>Purchase price</TableHead>
              <TableHead>Key terms</TableHead>
              <TableHead>Markers</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {versions.map((version) => (
              <TableRow
                key={version.id}
                className={isCurrent(version) ? 'bg-muted/50' : undefined}
              >
                <TableCell>{version.number}</TableCell>
                <TableCell>{version.author_side}</TableCell>
                <TableCell>{currency.format(version.purchase_price)}</TableCell>
                <TableCell>
                  {termsSummary(version.terms as unknown as OfferTerms)}
                </TableCell>
                <TableCell>
                  <span className={'flex flex-wrap gap-1'}>
                    {isCurrent(version) ? (
                      <Badge variant={'secondary'}>Current</Badge>
                    ) : null}
                    {version.approved_at !== null ? (
                      <Badge variant={'outline'}>Approved</Badge>
                    ) : null}
                    {isCurrent(version) && submitted ? (
                      <Badge variant={'outline'}>Submitted</Badge>
                    ) : null}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className={'flex flex-col gap-2'}>
          <h4 className={'text-sm font-medium'}>
            Diff from previous version
          </h4>
          {currentVersion === null || previousVersion === null ? (
            <p className={'text-muted-foreground text-sm'}>
              No previous version to compare
            </p>
          ) : diff.length === 0 ? (
            <p className={'text-muted-foreground text-sm'}>No term changes</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Term</TableHead>
                  <TableHead>Before</TableHead>
                  <TableHead>After</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diff.map((entry) => (
                  <TableRow key={entry.path}>
                    <TableCell>{entry.path}</TableCell>
                    <TableCell>{diffCell(entry.before)}</TableCell>
                    <TableCell>{diffCell(entry.after)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
