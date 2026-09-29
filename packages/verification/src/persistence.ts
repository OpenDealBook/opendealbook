import type { Json, TablesInsert } from '@odb/supabase';

import type { ReconciliationFinding } from './contract';

export interface FindingRowContext {
  runId: string;
  accountId: string;
  dealId: string;
}

function message(finding: ReconciliationFinding): string {
  const { period, expected, actual, deltaPct } = finding.detail;

  if (finding.status === 'missing') {
    return `${finding.checkKey}: cannot reconcile ${period}; expected ${expected}, actual ${actual}`;
  }

  const pct = ((deltaPct ?? 0) * 100).toFixed(2);

  return `${finding.checkKey}: ${period} expected ${expected}, actual ${actual} (${pct}% delta)`;
}

export function toFindingRow(
  finding: ReconciliationFinding,
  ctx: FindingRowContext,
): TablesInsert<'verification_finding'> {
  return {
    run_id: ctx.runId,
    account_id: ctx.accountId,
    deal_id: ctx.dealId,
    check_key: finding.checkKey,
    severity: finding.severity,
    detail: {
      period: finding.detail.period,
      expected: finding.detail.expected,
      actual: finding.detail.actual,
      deltaPct: finding.detail.deltaPct,
      status: finding.status,
      message: message(finding),
    } as Json,
    checklist_item_id: finding.links.checklistItemId ?? null,
    dr_document_id: finding.links.drDocumentId ?? null,
  };
}
