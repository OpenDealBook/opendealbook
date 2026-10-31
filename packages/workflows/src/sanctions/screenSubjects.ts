import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { z } from 'zod';

import {
  SCREENED_ENTRY,
  SCREENING_THRESHOLD,
  type ScreenedEntry,
  type ScreeningCandidate,
  type ScreeningSubject,
  matchSubjects,
  screeningKey,
  screeningPairs,
} from './match';
import { type Snapshot, screeningListSkip } from './snapshot';

const PAGE_SIZE = 1000;

const CANDIDATE_ENTRY = SCREENED_ENTRY.extend({ id: z.number() });

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
  const entries = new Map<number, ScreenedEntry>();
  for (const subject of subjects) {
    const key = screeningKey(subject.name, subject.kind);
    for (let after = 0; ; ) {
      const { data } = await client
        .rpc('screening_candidates', {
          p_variant: subject.kind,
          p_key: key,
          p_pairs: screeningPairs(key),
          p_threshold: SCREENING_THRESHOLD,
        })
        .select(['id', ...Object.keys(SCREENED_ENTRY.shape)].join(', '))
        .gt('id', after)
        .order('id')
        .limit(PAGE_SIZE)
        .throwOnError();
      const page = CANDIDATE_ENTRY.array().parse(data);
      if (page.length === 0) {
        break;
      }
      for (const { id, ...entry } of page) {
        entries.set(id, entry);
      }
      after = page.at(-1)!.id;
    }
  }
  const byId = [...entries].sort(([left], [right]) => left - right);
  return { candidates: matchSubjects(subjects, byId.map(([, entry]) => entry)) };
}
