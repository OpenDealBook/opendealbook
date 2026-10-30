import { Fragment } from 'react';

import {
  type CommentThread,
  type ContractType,
  type ContractVersionView,
  contractVersionViews,
  versionComments,
  visibleContracts,
} from '@odb/contracts';
import {
  type ContractDate,
  contractDatesPreview,
} from '@odb/deal-timeline/apply-contract-dates.ts';
import { draftEditorUrl } from '@odb/deals/server';
import { itemAnchor } from '@odb/notifications/relay';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import { SIGNING_UNDER_WAY, nestLoiExtensions } from '../_lib/loi-extensions';
import { ApplyContractDatesButton } from './apply-contract-dates-button';
import { ContractAdoptControl } from './contract-adopt-control';
import { ContractComments } from './contract-comments';
import { ContractPdfFailed } from './contract-pdf-failed';
import { DealReviewGate } from './contract-review-gate';
import {
  type ContractReview,
  ContractReviewPanel,
} from './contract-review-panel';
import { ContractShareToggle } from './contract-share-toggle';
import {
  ChangeExtensionEndDate,
  ExtendExclusivity,
  NoteLoiExtension,
} from './loi-extension-dialogs';
import { type LoiExtension, LoiExtensionList } from './loi-extension-list';
import { RecordSignedContract } from './record-signed-contract';

const TYPE_LABEL: Record<string, string> = { loi: 'LOI', apa: 'APA' };
const REVIEW_GATE: Record<ContractType, 'loi' | 'apa'> = {
  loi: 'loi',
  apa: 'apa',
  loi_extension: 'loi',
};
const PARTY_LABEL: Record<string, string> = {
  buyer: 'Buyer',
  seller: 'Seller',
};

type TeamContractVersion = ContractVersionView & {
  editorUrl: string | null;
  shared: boolean;
  comments: CommentThread[];
  review: ContractReview;
};

export async function DealContractsSection({
  dealId,
  filesPath,
}: {
  dealId: string;
  filesPath: string;
}) {
  const client = getSupabaseServerClient();
  const admin = getSupabaseServerAdminClient();

  const [summaries, { data: canManage }] = await Promise.all([
    visibleContracts(client, dealId),
    client
      .rpc('has_deal_permission', {
        deal_id: dealId,
        permission: 'deals.manage',
      })
      .throwOnError(),
  ]);
  const versionIds = summaries.flatMap((contract) =>
    contract.versions.map(({ id }) => id),
  );
  const [
    { data: versionRows },
    comments,
    { data: requests },
    { data: decisions },
    { data: overrides },
    { data: counsel },
    gates,
    ready,
  ] = await Promise.all([
    client
      .from('contract_version')
      .select('id, shared_at, signing_status')
      .in('id', versionIds)
      .throwOnError(),
    versionComments(client, versionIds),
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
    reviewGates(client, dealId),
    Promise.all(
      versionIds.map(async (id) => {
        const { data } = await client
          .rpc('contract_version_signing_ready', { contract_version_id: id })
          .throwOnError();

        return [id, data] as const;
      }),
    ).then(Object.fromEntries<boolean>),
  ]);

  function reviewOf(
    id: string,
    type: ContractType,
    signed: boolean,
  ): ContractReview {
    const row = versionRows.find((each) => each.id === id)!;

    return {
      required: gates[REVIEW_GATE[type]],
      ready: ready[id]!,
      sendable: !signed && !SIGNING_UNDER_WAY.includes(row.signing_status),
      counsel: {
        buyer: counsel.some(({ side }) => side === 'buyer'),
        seller: counsel.some(({ side }) => side === 'seller'),
      },
      requests: requests
        .filter((each) => each.contract_version_id === id)
        .map((each) => ({ requestedAt: each.requested_at })),
      decisions: decisions
        .filter((each) => each.contract_version_id === id)
        .map((each) => ({
          side: each.side,
          decision: each.decision,
          note: each.note,
          withoutCounsel: each.without_counsel,
          decidedAt: each.decided_at,
        })),
      overrides: overrides
        .filter((each) => each.contract_version_id === id)
        .map((each) => ({
          reason: each.reason,
          overriddenAt: each.overridden_at,
        })),
    };
  }

  const withVersions = await Promise.all(
    summaries.map(async (contract) => ({
      ...contract,
      versions: await Promise.all(
        (await contractVersionViews(admin, contract.versions)).map(
          async (version) => {
            const row = versionRows.find((each) => each.id === version.id)!;

            return {
              ...version,
              editorUrl:
                canManage && row.signing_status === 'draft'
                  ? await draftEditorUrl(client, version.id)
                  : null,
              shared: row.shared_at !== null,
              comments: comments[version.id]!,
              review: reviewOf(
                version.id,
                contract.type as ContractType,
                version.is_signed,
              ),
            };
          },
        ),
      ),
    })),
  );
  const contracts = await Promise.all(
    (await nestLoiExtensions(client, withVersions, 'buyer')).map(
      async (contract) => ({
        ...contract,
        dates: await contractDatesPreview(contract.id),
      }),
    ),
  );

  return (
    <DealContracts
      dealId={dealId}
      contracts={contracts}
      canManage={canManage}
      filesPath={filesPath}
      gates={gates}
    />
  );
}

async function reviewGates(
  client: ReturnType<typeof getSupabaseServerClient>,
  dealId: string,
) {
  const required = async (type: 'loi' | 'apa') =>
    (
      await client
        .rpc('contract_review_required', {
          deal_id: dealId,
          contract_type: type,
        })
        .throwOnError()
    ).data;
  const [loi, apa] = await Promise.all([required('loi'), required('apa')]);

  return { loi, apa };
}

export function DealContracts({
  dealId,
  contracts,
  canManage,
  filesPath,
  gates,
}: {
  dealId: string;
  contracts: {
    id: string;
    type: string;
    current_version: number | null;
    dates: ContractDate[] | null;
    versions: TeamContractVersion[];
    extensions: (LoiExtension<TeamContractVersion> & {
      current_version: number | null;
    })[];
  }[];
  canManage: boolean;
  filesPath: string;
  gates: Record<'loi' | 'apa', boolean>;
}) {
  const extendable = (contract: (typeof contracts)[number]) =>
    canManage &&
    contract.type === 'loi' &&
    contract.versions.some(
      (version) =>
        version.version === contract.current_version && version.is_signed,
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contracts</CardTitle>
        {canManage ? (
          <CardAction className={'flex flex-wrap justify-end gap-2'}>
            {(['loi', 'apa'] as const)
              .filter(
                (type) => !contracts.some((contract) => contract.type === type),
              )
              .map((type) => (
                <RecordSignedContract
                  key={type}
                  dealId={dealId}
                  type={type}
                  contractId={null}
                />
              ))}
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className={'flex flex-col gap-4'}>
        {contracts.length === 0 ? (
          <p className={'text-muted-foreground'}>No contracts yet.</p>
        ) : null}
        {canManage ? <DealReviewGate dealId={dealId} gates={gates} /> : null}
        {contracts.map((contract) => (
          <Card key={contract.id}>
            <CardHeader>
              <CardTitle>{TYPE_LABEL[contract.type]}</CardTitle>
              {canManage ? (
                <CardAction className={'flex flex-wrap justify-end gap-2'}>
                  <RecordSignedContract
                    dealId={dealId}
                    type={contract.type as 'loi' | 'apa'}
                    contractId={contract.id}
                  />
                  {extendable(contract) ? (
                    <ExtendExclusivity dealId={dealId} loiId={contract.id} />
                  ) : null}
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent className={'flex flex-col gap-4'}>
              {canManage && contract.dates ? (
                <ApplyContractDatesButton
                  contractId={contract.id}
                  dates={contract.dates}
                />
              ) : null}
              <TeamContractVersions
                contract={contract}
                canManage={canManage}
                canSend={canManage}
                filesPath={filesPath}
              />
              {contract.extensions.length > 0 ? (
                <LoiExtensionList
                  extensions={contract.extensions}
                  filesPath={filesPath}
                  actions={(extension) =>
                    extendable(contract) ? (
                      <>
                        {extension.state === 'draft' ? (
                          <>
                            <ChangeExtensionEndDate
                              dealId={dealId}
                              extensionId={extension.id}
                              extendsTo={extension.extends_to}
                            />
                            <NoteLoiExtension
                              dealId={dealId}
                              extensionId={extension.id}
                            />
                          </>
                        ) : null}
                        {extension.state === 'draft' ||
                        extension.state === 'noted' ? (
                          <RecordSignedContract
                            dealId={dealId}
                            type={'loi_extension'}
                            contractId={extension.id}
                          />
                        ) : null}
                      </>
                    ) : null
                  }
                  body={(extension) => (
                    <TeamContractVersions
                      contract={extension}
                      canManage={canManage}
                      canSend={
                        extendable(contract) && extension.state === 'draft'
                      }
                      filesPath={filesPath}
                    />
                  )}
                />
              ) : null}
            </CardContent>
          </Card>
        ))}
      </CardContent>
    </Card>
  );
}

function TeamContractVersions({
  contract,
  canManage,
  canSend,
  filesPath,
}: {
  contract: { current_version: number | null; versions: TeamContractVersion[] };
  canManage: boolean;
  canSend: boolean;
  filesPath: string;
}) {
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Version</TableHead>
            <TableHead>From</TableHead>
            <TableHead>Summary</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Files</TableHead>
            {canManage ? <TableHead>Current</TableHead> : null}
            {canManage ? <TableHead>Seller side</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {contract.versions.map((version) => (
            <TableRow
              key={version.id}
              id={itemAnchor({
                kind: 'contract-version',
                id: version.id,
              })}
            >
              <TableCell>{version.version}</TableCell>
              <TableCell>{PARTY_LABEL[version.party]}</TableCell>
              <TableCell className={'min-w-40 whitespace-normal'}>
                {version.change_summary}
              </TableCell>
              <TableCell>{version.is_signed ? 'Signed' : null}</TableCell>
              <TableCell className={'whitespace-normal'}>
                <div className={'flex flex-wrap items-center gap-x-3 gap-y-1'}>
                  {version.hasDocx ? (
                    <a
                      className={'underline'}
                      href={`${filesPath}/${version.id}/docx`}
                    >
                      Word
                    </a>
                  ) : null}
                  {version.hasPdf ? (
                    <a
                      className={'underline'}
                      href={`${filesPath}/${version.id}/pdf`}
                    >
                      PDF
                    </a>
                  ) : version.hasDocx ? (
                    <ContractPdfFailed
                      contractVersionId={version.id}
                      canRetry={canManage}
                    />
                  ) : null}
                </div>
              </TableCell>
              {canManage ? (
                <TableCell>
                  <ContractAdoptControl
                    contractVersionId={version.id}
                    current={version.version === contract.current_version}
                  />
                </TableCell>
              ) : null}
              {canManage ? (
                <TableCell>
                  {version.party === 'buyer' ? (
                    <ContractShareToggle
                      contractVersionId={version.id}
                      shared={version.shared}
                    />
                  ) : null}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {contract.versions.map((version) =>
        version.redline ? (
          <details key={version.id}>
            <summary>Changes in version {version.version}</summary>
            <p className={'mt-2 leading-relaxed'}>
              {version.redline.map((segment, index) => (
                <Fragment key={index}>
                  {segment.type === 'added' ? (
                    <ins className={'text-success'}>{segment.text}</ins>
                  ) : segment.type === 'removed' ? (
                    <del className={'text-destructive'}>{segment.text}</del>
                  ) : (
                    segment.text
                  )}{' '}
                </Fragment>
              ))}
            </p>
          </details>
        ) : null,
      )}
      {contract.versions.map((version) => (
        <section
          key={version.id}
          id={itemAnchor({ kind: 'contract-review', id: version.id })}
          data-version-review
          className={'flex flex-col gap-2'}
        >
          <h3 className={'text-sm font-semibold'}>
            Counsel sign-off on version {version.version}
          </h3>
          <ContractReviewPanel
            contractVersionId={version.id}
            review={version.review}
            canManage={canSend}
            editorUrl={version.editorUrl}
          />
        </section>
      ))}
      {contract.versions.map((version) => (
        <section
          key={version.id}
          data-version-comments
          className={'flex flex-col gap-2'}
        >
          <h3 className={'text-sm font-semibold'}>
            Comments on version {version.version}
          </h3>
          <ContractComments
            contractVersionId={version.id}
            threads={version.comments}
            viewer={canManage ? { side: 'buyer' } : null}
          />
        </section>
      ))}
    </>
  );
}
