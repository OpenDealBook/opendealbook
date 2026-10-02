export type CompConsumer = 'recordDealActivity' | 'detectDuplicates' | 'anonymizeClose';

export interface RelayEvent {
  globalSeq: number;
  dealId: string;
  dealSeq: number;
  aggregateType: string;
  eventType: string;
  resolution: string | null;
}

export interface RelayStep {
  event: RelayEvent;
  consumers: CompConsumer[];
}

export interface RelayPlan {
  steps: RelayStep[];
  cursor: number;
}

export function routeRelayEvent(event: RelayEvent): CompConsumer[] {
  const consumers: CompConsumer[] = [];
  if (event.eventType === 'deal.created') {
    consumers.push('detectDuplicates');
  }
  if (event.aggregateType === 'deal') {
    consumers.push('recordDealActivity');
  }
  if (event.eventType === 'deal.resolved' && event.resolution === 'won') {
    consumers.push('anonymizeClose');
  }
  return consumers;
}

export function planRelayDispatch(events: RelayEvent[], cursor: number): RelayPlan {
  const ordered = [...events].sort((a, b) => a.globalSeq - b.globalSeq);
  const steps: RelayStep[] = [];
  let next = cursor;
  for (const event of ordered) {
    if (event.globalSeq <= cursor) {
      continue;
    }
    const consumers = routeRelayEvent(event);
    if (consumers.length > 0) {
      steps.push({ event, consumers });
    }
    next = event.globalSeq;
  }
  return { steps, cursor: next };
}
