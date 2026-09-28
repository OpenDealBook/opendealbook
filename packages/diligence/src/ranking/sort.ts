import type { Tables } from '@tuckin/supabase';

type ChecklistItem = Tables<'checklist_item'>;

export function sortByRisk(items: ChecklistItem[]): ChecklistItem[] {
  return [...items].sort(compareRisk);
}

export function dealBlockers(items: ChecklistItem[]): ChecklistItem[] {
  return items.filter(
    (item) =>
      item.deal_killer &&
      (item.outcome === 'rejected' || item.outcome === 'follow_up'),
  );
}

function compareRisk(a: ChecklistItem, b: ChecklistItem): number {
  if (a.deal_killer !== b.deal_killer) {
    return a.deal_killer ? -1 : 1;
  }

  if (a.priority !== b.priority) {
    return b.priority - a.priority;
  }

  return dueRank(a.due_at) - dueRank(b.due_at);
}

function dueRank(due: string | null): number {
  return due ? Date.parse(due) : Number.POSITIVE_INFINITY;
}
