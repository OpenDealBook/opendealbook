import { insert, rows } from './db';

import { randomUUID } from 'node:crypto';

const YESTERDAY = () =>
  new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

export async function seedFinishedSearch({
  accountId,
  dealId,
  businessName,
}: {
  accountId: string;
  dealId: string;
  businessName: string;
}) {
  const [workflow] = await rows<{
    id: string;
    workflow_version: { id: string }[];
  }>(
    'workflow',
    `account_id=eq.${accountId}&system_key=eq.background_search&select=id,workflow_version(id)`,
  );
  const at = YESTERDAY();
  const [run] = await insert<{ id: string }>('workflow_run', {
    account_id: accountId,
    workflow_id: workflow!.id,
    version_id: workflow!.workflow_version[0]!.id,
    trigger_kind: 'manual',
    trigger_ref: randomUUID(),
    trigger_node_id: 'loi-signed',
    trigger_output: { dealId, accountId },
    status: 'succeeded',
    started_at: at,
    finished_at: at,
  });
  const [diligenceRun] = await insert<{ id: string }>('diligence_run', {
    account_id: accountId,
    deal_id: dealId,
    workflow_run_id: run!.id,
  });
  const owned = {
    run_id: diligenceRun!.id,
    deal_id: dealId,
    account_id: accountId,
    raw: {},
  };

  await insert('diligence_finding', [
    {
      ...owned,
      subject_kind: 'business',
      subject_name: businessName,
      subject_key: `business:${businessName.toLowerCase()}`,
      source: 'courts',
      severity: 'red',
      severity_reason: 'Open federal civil suit with the business as defendant',
      title: `Harbour Supply v. ${businessName}`,
      summary: 'District Court, S.D. Texas; docket 4:21-cv-00412',
      source_url: 'https://www.courtlistener.com/docket/61234567/',
      occurred_on: '2021-03-04',
    },
    {
      ...owned,
      subject_kind: 'person',
      subject_name: 'Dana Rowan',
      subject_key: 'person:dana rowan',
      source: 'sanctions',
      severity: 'amber',
      severity_reason:
        'Possible match, review. The listed person shares a similar name only.',
      title: 'Dana Rowen on SDN list',
      summary: 'Matched Dana Rowen at 91%',
      source_url: 'https://sanctionssearch.ofac.treas.gov/',
      occurred_on: null,
    },
    {
      ...owned,
      subject_kind: 'business',
      subject_name: businessName,
      subject_key: `business:${businessName.toLowerCase()}`,
      source: 'reviews',
      severity: 'green',
      severity_reason: 'A satisfied customer review',
      title: `5-star review of ${businessName}`,
      summary: 'Prompt and tidy work.',
      source_url: 'https://maps.google.com/?cid=1',
      occurred_on: '2026-09-12',
    },
  ]);
  await insert('diligence_report', {
    run_id: diligenceRun!.id,
    deal_id: dealId,
    account_id: accountId,
    summary: 'One open federal lawsuit needs review before closing.',
    model: 'e2e-model',
  });
}
