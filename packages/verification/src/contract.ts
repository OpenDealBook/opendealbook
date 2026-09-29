export type ReconciliationSeverity = 'info' | 'warning' | 'error';

export type ReconciliationStatus = 'reconciled' | 'discrepancy' | 'missing';

export interface ReconciliationLinks {
  checklistItemId?: string;
  drDocumentId?: string;
}

export interface ReconciliationDetail {
  period: string;
  expected: number | null;
  actual: number | null;
  deltaPct: number | null;
}

export interface ReconciliationFinding {
  checkKey: string;
  severity: ReconciliationSeverity;
  status: ReconciliationStatus;
  detail: ReconciliationDetail;
  links: ReconciliationLinks;
}

export interface ReconciliationCheck<TInput> {
  key: string;
  evaluate(input: TInput): ReconciliationFinding[];
}

export interface GatherContext {
  dealId: string;
  period: string;
}

export interface CheckGatherer<TInput> {
  key: string;
  gather(ctx: GatherContext): Promise<TInput>;
}
