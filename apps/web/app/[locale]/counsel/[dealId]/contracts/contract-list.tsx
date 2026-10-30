import { Fragment } from 'react';

import Link from 'next/link';

import type {
  CommentThread,
  ContractComment,
  ContractVersionView,
} from '@odb/contracts';
import { counselPortalPath } from '@odb/deal-counsel/entry-rules.ts';
import { itemAnchor } from '@odb/notifications/relay';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import { ContractComments } from '../../../home/_components/contract-comments';
import { ContractPdfFailed } from '../../../home/_components/contract-pdf-failed';
import {
  type LoiExtension,
  LoiExtensionList,
} from '../../../home/_components/loi-extension-list';
import {
  ContractReview,
  type DecideReview,
  type VersionReview,
} from './contract-review';
import { RedlineUpload } from './redline-upload';

const TYPE_LABEL: Record<string, string> = { loi: 'LOI', apa: 'APA' };
const PARTY_LABEL: Record<string, string> = {
  buyer: 'Buyer',
  seller: 'Seller',
};

type CounselVersion = ContractVersionView & {
  comments: CommentThread[];
  review: VersionReview;
};

export function ContractList({
  dealId,
  filesPath,
  redlineUpload,
  contracts,
  viewer,
  decide,
}: {
  dealId: string;
  filesPath: string;
  redlineUpload: boolean;
  contracts: {
    id: string;
    type: string;
    versions: CounselVersion[];
    extensions: LoiExtension<CounselVersion>[];
  }[];
  viewer: { side: ContractComment['side'] } | null;
  decide: DecideReview | null;
}) {
  if (contracts.length === 0) {
    return redlineUpload ? (
      <div
        className={
          'flex flex-col items-start gap-3 rounded-lg border border-dashed p-6'
        }
      >
        <p className={'text-muted-foreground'}>
          When the deal team shares the LOI or APA you&apos;ll get an email and
          can upload redlines here.
        </p>
        <Link
          href={`${counselPortalPath(dealId)}/messages`}
          className={'text-sm font-medium underline-offset-4 hover:underline'}
        >
          Message the deal team
        </Link>
      </div>
    ) : (
      <p className={'text-muted-foreground'}>
        No contracts have been shared with you yet.
      </p>
    );
  }

  return contracts.map((contract) => (
    <Card key={contract.id}>
      <CardHeader>
        <CardTitle>{TYPE_LABEL[contract.type]}</CardTitle>
      </CardHeader>
      <CardContent className={'flex flex-col gap-4'}>
        <CounselContractVersions
          contract={contract}
          dealId={dealId}
          filesPath={filesPath}
          redlineUpload={redlineUpload}
          viewer={viewer}
          decide={decide}
        />
        {contract.extensions.length > 0 ? (
          <LoiExtensionList
            extensions={contract.extensions}
            filesPath={filesPath}
            actions={() => null}
            body={(extension) => (
              <CounselContractVersions
                contract={extension}
                dealId={dealId}
                filesPath={filesPath}
                redlineUpload={redlineUpload}
                viewer={viewer}
                decide={decide}
              />
            )}
          />
        ) : null}
      </CardContent>
    </Card>
  ));
}

function CounselContractVersions({
  contract,
  dealId,
  filesPath,
  redlineUpload,
  viewer,
  decide,
}: {
  contract: { id: string; versions: CounselVersion[] };
  dealId: string;
  filesPath: string;
  redlineUpload: boolean;
  viewer: { side: ContractComment['side'] } | null;
  decide: DecideReview | null;
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
          </TableRow>
        </TableHeader>
        <TableBody>
          {contract.versions.map((version) => (
            <TableRow
              key={version.id}
              id={itemAnchor({ kind: 'contract-version', id: version.id })}
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
                      canRetry={redlineUpload}
                    />
                  ) : null}
                </div>
              </TableCell>
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
            Sign-off on version {version.version}
          </h3>
          <ContractReview
            contractVersionId={version.id}
            review={version.review}
            decide={decide}
            redlineUpload={redlineUpload}
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
            viewer={viewer}
          />
        </section>
      ))}
      {redlineUpload ? (
        <RedlineUpload dealId={dealId} contractId={contract.id} />
      ) : null}
    </>
  );
}
