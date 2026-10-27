import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import {
  SCREENED_ENTRY,
  type ScreenedEntry,
  type ScreeningCandidate,
  type ScreeningSubject,
  matchSubjects,
} from './match';
import { type Snapshot, screeningListSkip } from './snapshot';

const PAGE_SIZE = 1000;

async function newestSucceededImportAt(): Promise<string | null> {
  const { data } = await getSupabaseServerAdminClient()
    .from('screening_import')
    .select('created_at')
    .eq('status', 'succeeded')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
    .throwOnError();
  return data?.created_at ?? null;
}

export async function currentSnapshot(): Promise<Snapshot | null> {
  const startedAt = await newestSucceededImportAt();
  if (startedAt === null) {
    return null;
  }
  const { count } = await getSupabaseServerAdminClient()
    .from('screening_entry_current')
    .select('*', { count: 'exact', head: true })
    .throwOnError();
  return { startedAt, entries: count! };
}

export async function screenSubjects(
  subjects: ScreeningSubject[],
): Promise<{ candidates: ScreeningCandidate[] } | { skipped: string }> {
  const skipped = screeningListSkip(await currentSnapshot(), new Date());
  if (skipped !== null) {
    return { skipped };
  }
  const client = getSupabaseServerAdminClient();
  const entries: ScreenedEntry[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await client
      .from('screening_entry_current')
      .select(Object.keys(SCREENED_ENTRY.shape).join(', '))
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
      .throwOnError();
    entries.push(...SCREENED_ENTRY.array().parse(data));
    if (data.length < PAGE_SIZE) {
      return { candidates: matchSubjects(subjects, entries) };
    }
  }
}
