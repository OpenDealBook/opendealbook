import { z } from 'zod';

import type { Database, Json } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { type CourtCandidate, searchFederalCourts } from '../../diligence/sources/courts';
import { type NewsCandidate, searchNews } from '../../diligence/sources/news';
import { diligenceSubjects, type DiligenceSubject } from '../../diligence/subjects';
import type { ScreeningCandidate } from '../../sanctions/match';
import { screenSubjects } from '../../sanctions/screenSubjects';
import { uuidFromKey } from '../../uuidFromKey';
import { NODE_CONFIG_SCHEMAS } from '../graph';
import { defineStep } from '../step';

type Source = Database['public']['Enums']['diligence_source'];

type Candidate = CourtCandidate | NewsCandidate | ScreeningCandidate;

type Search = { skipped: string } | { candidates: Candidate[] };

function findingOf(candidate: Candidate) {
  switch (candidate.source) {
    case 'courts':
      return {
        source: 'courts' as const,
        identity: candidate.url,
        title: candidate.caseName,
        summary: [candidate.court, `docket ${candidate.docketNumber}`, candidate.natureOfSuit].filter(Boolean).join('; '),
        source_url: candidate.url,
        occurred_on: candidate.filedOn,
      };
    case 'news':
      return {
        source: 'news' as const,
        identity: candidate.url,
        title: candidate.title,
        summary: `${candidate.publisher}: ${candidate.snippet}`,
        source_url: candidate.url,
        occurred_on: candidate.publishedOn,
      };
    case 'reviews':
      return {
        source: 'reviews' as const,
        identity: JSON.stringify(candidate.raw),
        title: `${candidate.stars}-star review of ${candidate.placeName}`,
        summary: [candidate.text, candidate.ownerResponse && `Owner replied: ${candidate.ownerResponse}`].filter(Boolean).join('\n'),
        source_url: candidate.url,
        occurred_on: candidate.publishedOn,
      };
    case 'sanctions':
      return {
        source: 'sanctions' as const,
        identity: `${candidate.listName}:${candidate.sourceEntryId}`,
        title: `${candidate.entryName} on ${candidate.listName}`,
        summary: [`Matched ${candidate.matchedName} at ${Math.round(candidate.score * 100)}%`, ...(candidate.programs.length > 0 ? [`programs ${candidate.programs.join(', ')}`] : [])].join('; '),
        source_url: candidate.url,
        occurred_on: null,
      };
  }
}

export const diligenceSearch = defineStep({
  type: 'diligence_search',
  runOnce: false,
  configSchema: NODE_CONFIG_SCHEMAS.diligence_search,
  inputSchema: z.object({}),
  outputSchema: z.object({
    runId: z.string(),
    skipped: z.object({ courts: z.string().optional(), news: z.string().optional(), sanctions: z.string().optional() }),
  }),
  async run({ context, config }) {
    const admin = getSupabaseServerAdminClient();
    const deal = await diligenceSubjects(context.accountId, config.dealId);
    const runId = uuidFromKey(`diligence_run:${context.idempotencyKey}`);
    const findingOwner = { run_id: runId, deal_id: deal.dealId, account_id: context.accountId };
    await admin
      .from('diligence_run')
      .upsert(
        { id: runId, account_id: context.accountId, deal_id: deal.dealId, workflow_run_id: context.runId },
        { onConflict: 'id', ignoreDuplicates: true },
      )
      .throwOnError();
    const { data: checks } = await admin
      .from('diligence_search_check')
      .select('source, subject_key')
      .eq('run_id', runId)
      .throwOnError();
    const searched = new Set(checks.map((check) => `${check.source}:${check.subject_key}`));
    const unsearched = (source: Source) => deal.subjects.filter((subject) => !searched.has(`${source}:${subject.key}`));
    const subjectByKey = new Map(deal.subjects.map((subject) => [subject.key, subject]));

    async function searchAndRecord(source: Source, subjects: DiligenceSubject[], search: (subjects: DiligenceSubject[]) => Promise<Search>) {
      if (subjects.length === 0) {
        return undefined;
      }
      const result = await search(subjects);
      if ('skipped' in result) {
        return result.skipped;
      }
      const findings = result.candidates.map((candidate) => {
        const subject = subjectByKey.get(candidate.subjectKey)!;
        const { identity, ...finding } = findingOf(candidate);
        return {
          ...findingOwner,
          ...finding,
          id: uuidFromKey(`diligence_finding:${runId}:${finding.source}:${subject.key}:${identity}`),
          subject_kind: subject.kind,
          subject_name: subject.name,
          subject_key: subject.key,
          raw: candidate as Json,
        };
      });
      await admin.from('diligence_finding').upsert(findings, { onConflict: 'id', ignoreDuplicates: true }).throwOnError();
      await admin
        .from('diligence_search_check')
        .upsert(
          subjects.map((subject) => ({ run_id: runId, source, subject_key: subject.key })),
          { onConflict: 'run_id,source,subject_key', ignoreDuplicates: true },
        )
        .throwOnError();
      return undefined;
    }

    const lanes = await Promise.allSettled([
      (async () => {
        for (const subject of unsearched('courts')) {
          const skipped = await searchAndRecord(
            'courts',
            [subject],
            (subjects) =>
              searchFederalCourts({ accountId: context.accountId, subjects, state: deal.state, signal: context.signal }),
          );
          if (skipped) {
            return skipped;
          }
        }
        return undefined;
      })(),
      searchAndRecord('news', unsearched('news'), (subjects) =>
        searchNews({
          accountId: context.accountId,
          dealId: deal.dealId,
          firmId: deal.firmId,
          state: deal.state,
          subjects,
          searchAllNames: config.searchAllNames,
          idempotencyKey: context.idempotencyKey,
          signal: context.signal,
        }),
      ),
      searchAndRecord('sanctions', unsearched('sanctions'), screenSubjects),
    ]);
    const [courts, news, sanctions] = lanes.map((lane) => {
      if (lane.status === 'rejected') {
        throw lane.reason;
      }
      return lane.value;
    });
    return { runId, skipped: { courts, news, sanctions } };
  },
});
