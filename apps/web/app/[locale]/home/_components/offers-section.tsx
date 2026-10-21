import {
  type DealOffer,
  type OfferTerms,
  dealBoxScreenPasses,
  diffOfferTerms,
  fetchDealOffers,
} from '@odb/deals';
import { loadOfferSignatures } from '@odb/deals/server';
import { itemAnchor } from '@odb/notifications/relay';
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

import { OfferCounselSignOff } from './offer-counsel-sign-off';
import { CreateOfferButton, OfferLifecycleActions } from './offer-editor';
import { contractSignatures } from './signature-wording';

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

async function offerReviews(
  client: ReturnType<typeof getSupabaseServerClient>,
  dealId: string,
  signatures: Awaited<ReturnType<typeof loadOfferSignatures>>,
) {
  const latest = (['loi', 'apa'] as const).flatMap((type) => {
    const signature = signatures[type];

    return signature === null
      ? []
      : [{ type, contractVersionId: signature.contractVersionId }];
  });
  const versionIds = latest.map(({ contractVersionId }) => contractVersionId);

  const [
    { data: requests },
    { data: decisions },
    { data: overrides },
    { data: counsel },
  ] = await Promise.all([
    client
      .from('contract_review_request')
      .select('contract_version_id, requested_at')
      .in('contract_version_id', versionIds)
      .order('requested_at')
      .throwOnError(),
    client
      .from('contract_review_decision')
      .select(
        'contract_version_id, side, decision, note, without_counsel, decided_at',
      )
      .in('contract_version_id', versionIds)
      .order('decided_at')
      .throwOnError(),
    client
      .from('contract_signing_override')
      .select('contract_version_id, reason, overridden_at')
      .in('contract_version_id', versionIds)
      .order('overridden_at')
      .throwOnError(),
    client
      .from('deal_counsel')
      .select('side')
      .eq('deal_id', dealId)
      .throwOnError(),
  ]);

  return Promise.all(
    latest.map(async ({ type, contractVersionId }) => {
      const [{ data: required }, { data: ready }] = await Promise.all([
        client
          .rpc('contract_review_required', {
            deal_id: dealId,
            contract_type: type,
          })
          .throwOnError(),
        client
          .rpc('contract_version_signing_ready', {
            contract_version_id: contractVersionId,
          })
          .throwOnError(),
      ]);
      const ofVersion = ({
        contract_version_id,
      }: {
        contract_version_id: string;
      }) => contract_version_id === contractVersionId;

      return {
        type,
        contractVersionId,
        review: {
          required,
          ready,
          sendable: false,
          counsel: {
            buyer: counsel.some(({ side }) => side === 'buyer'),
            seller: counsel.some(({ side }) => side === 'seller'),
          },
          requests: requests
            .filter(ofVersion)
            .map((each) => ({ requestedAt: each.requested_at })),
          decisions: decisions.filter(ofVersion).map((each) => ({
            side: each.side,
            decision: each.decision,
            note: each.note,
            withoutCounsel: each.without_counsel,
            decidedAt: each.decided_at,
          })),
          overrides: overrides.filter(ofVersion).map((each) => ({
            reason: each.reason,
            overriddenAt: each.overridden_at,
          })),
        },
      };
    }),
  );
}

export async function OffersSection({
  dealId,
}: {
  dealId: string;
  accountId: string;
}) {
  const client = getSupabaseServerClient();
  const { live, history } = await fetchDealOffers(client, { deal_id: dealId });

  return (
    <Card>
      <CardHeader>
        <CardTitle className={'flex items-center gap-2'}>
          Offers
          {live === null ? null : (
            <Badge variant={statusVariant(live.offer.status)}>
              {live.offer.status}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className={'flex flex-col gap-6'}>
        {live === null ? (
          <div className={'flex flex-col items-start gap-3'}>
            <p className={'text-muted-foreground text-sm'}>No live offer</p>
            <CreateOfferButton dealId={dealId} />
          </div>
        ) : (
          <LiveOffer dealId={dealId} offer={live} />
        )}
        {history.length === 0 ? null : <OfferHistory history={history} />}
      </CardContent>
    </Card>
  );
}

function OfferHistory({ history }: { history: DealOffer[] }) {
  return (
    <div className={'flex flex-col gap-2'}>
      <h4 className={'text-sm font-medium'}>Previous offers</h4>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Offer</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Purchase price</TableHead>
            <TableHead>Versions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {history.map(({ offer, versions, currentVersion }, index) => (
            <TableRow
              key={offer.id}
              id={itemAnchor({ kind: 'offer', id: offer.id })}
            >
              <TableCell>{history.length - index}</TableCell>
              <TableCell>
                <Badge variant={statusVariant(offer.status)}>
                  {offer.status}
                </Badge>
              </TableCell>
              <TableCell>
                {currentVersion === null
                  ? '--'
                  : currency.format(currentVersion.purchase_price)}
              </TableCell>
              <TableCell>{versions.length}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

async function LiveOffer({
  dealId,
  offer,
}: {
  dealId: string;
  offer: DealOffer;
}) {
  const client = getSupabaseServerClient();
  const { versions, currentVersion } = offer;
  const maxNumber = versions.reduce(
    (highest, version) => Math.max(highest, version.number),
    0,
  );
  const previousVersion =
    currentVersion === null
      ? null
      : (versions.find(
          (version) => version.number === currentVersion.number - 1,
        ) ?? null);

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
  const signatures = await loadOfferSignatures(client, offer.offer.id);

  return (
    <div
      id={itemAnchor({ kind: 'offer', id: offer.offer.id })}
      className={'flex flex-col gap-6'}
    >
      <OfferLifecycleActions
        offerId={offer.offer.id}
        status={offer.offer.status}
        dealId={dealId}
        nextNumber={maxNumber + 1}
        loiGatePassed={loiGatePassed}
        loiAccepted={loiAccepted}
        signatures={contractSignatures(signatures)}
      />
      <OfferCounselSignOff
        reviews={await offerReviews(client, dealId, signatures)}
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
        <h4 className={'text-sm font-medium'}>Diff from previous version</h4>
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
    </div>
  );
}
