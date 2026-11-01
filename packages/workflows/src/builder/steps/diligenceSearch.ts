import { z } from 'zod';

import type { Database, Json } from '@odb/supabase';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import {
  checkBaselayer,
  type BaselayerCheck,
} from '../../diligence/sources/baselayer';
import type { BrokerRecord } from '../../diligence/sources/broker';
import {
  type CourtCandidate,
  searchFederalCourts,
} from '../../diligence/sources/courts';
import {
  type LicenseCandidate,
  searchLicenses,
} from '../../diligence/sources/licenses';
import { checkMiddesk } from '../../diligence/sources/middesk';
import { type NewsCandidate, searchNews } from '../../diligence/sources/news';
import {
  diligenceSubjects,
  type DiligenceSubject,
} from '../../diligence/subjects';
import type { ScreeningCandidate } from '../../sanctions/match';
import { screenSubjects } from '../../sanctions/screenSubjects';
import { uuidFromKey } from '../../uuidFromKey';
import { NODE_CONFIG_SCHEMAS } from '../graph';
import { PollAgain } from '../pollAgain';
import { providerKey } from '../providerKeys';
import { defineStep } from '../step';

type Source = Database['public']['Enums']['diligence_source'];

type Broker = BrokerRecord['source'];

type CourtRecordCandidate = Omit<BrokerRecord, 'source' | 'raw'> & {
  source: 'court_records';
  broker: Broker;
  subjectKey: string;
  raw: Json;
};

type Candidate =
  | CourtCandidate
  | NewsCandidate
  | ScreeningCandidate
  | LicenseCandidate
  | CourtRecordCandidate;

const BROKER_NAME: Record<Broker, string> = {
  baselayer: 'Baselayer',
  middesk: 'Middesk',
};

const COURT_RECORD_KIND: Record<BrokerRecord['kind'], string> = {
  ucc: 'UCC filing',
  tax_lien: 'Tax lien',
  judgment_lien: 'Judgment lien',
  litigation: 'Lawsuit',
  bankruptcy: 'Bankruptcy',
  unknown: 'Court record',
};

const BROKER_POLL_MS = 5 * 60 * 1000;
const BROKER_GIVE_UP_MS = 24 * 60 * 60 * 1000;
const BROKER_CLAIM_STALE_MS = 2 * 60 * 1000;

type Search = { skipped: string } | { candidates: Candidate[] };

function findingOf(candidate: Candidate) {
  switch (candidate.source) {
    case 'courts':
      return {
        source: 'courts' as const,
        identity: candidate.url,
        title: candidate.caseName,
        summary: [
          candidate.court,
          `docket ${candidate.docketNumber}`,
          candidate.natureOfSuit,
        ]
          .filter(Boolean)
          .join('; '),
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
        summary: [
          candidate.text,
          candidate.ownerResponse &&
            `Owner replied: ${candidate.ownerResponse}`,
        ]
          .filter(Boolean)
          .join('\n'),
        source_url: candidate.url,
        occurred_on: candidate.publishedOn,
      };
    case 'sanctions':
      return {
        source: 'sanctions' as const,
        identity: `${candidate.listName}:${candidate.sourceEntryId}`,
        title: `${candidate.entryName} on ${candidate.listName}`,
        summary: [
          `Matched ${candidate.matchedName} at ${Math.round(candidate.score * 100)}%`,
          ...(candidate.programs.length > 0
            ? [`programs ${candidate.programs.join(', ')}`]
            : []),
        ].join('; '),
        source_url: candidate.url,
        occurred_on: null,
      };
    case 'licenses':
      return {
        source: 'licenses' as const,
        identity: JSON.stringify([
          candidate.registry,
          candidate.licenseNumber,
          candidate.licenseType,
          candidate.licenseeName,
        ]),
        title: `${candidate.licenseType ?? 'License'} from ${candidate.registry}`,
        summary: [
          `Licensed to ${candidate.licenseeName}`,
          candidate.licenseNumber && `number ${candidate.licenseNumber}`,
          candidate.status,
          candidate.expiresOn && `expires ${candidate.expiresOn}`,
        ]
          .filter(Boolean)
          .join('; '),
        source_url: null,
        occurred_on: null,
      };
    case 'court_records':
      return {
        source: 'court_records' as const,
        identity: JSON.stringify([
          candidate.broker,
          candidate.kind,
          candidate.jurisdiction,
          candidate.reference,
        ]),
        title: candidate.title || COURT_RECORD_KIND[candidate.kind],
        summary: [
          COURT_RECORD_KIND[candidate.kind],
          candidate.jurisdiction,
          candidate.reference,
        ]
          .filter(Boolean)
          .join('; '),
        source_url: null,
        occurred_on: candidate.filedOn,
      };
  }
}

function valueOf<Value>(lane: PromiseSettledResult<Value>): Value {
  if (lane.status === 'rejected') {
    throw lane.reason;
  }
  return lane.value;
}

export const diligenceSearch = defineStep({
  type: 'diligence_search',
  runOnce: false,
  configSchema: NODE_CONFIG_SCHEMAS.diligence_search,
  inputSchema: z.object({}),
  outputSchema: z.object({
    runId: z.string(),
    skipped: z.object({
      courts: z.string().optional(),
      news: z.string().optional(),
      sanctions: z.string().optional(),
      licenses: z.array(z.string()).optional(),
      court_records: z.string().optional(),
    }),
  }),
  async run({ context, config }) {
    const admin = getSupabaseServerAdminClient();
    const deal = await diligenceSubjects(context.accountId, config.dealId);
    const runId = uuidFromKey(`diligence_run:${context.idempotencyKey}`);
    const findingOwner = {
      run_id: runId,
      deal_id: deal.dealId,
      account_id: context.accountId,
    };
    await admin
      .from('diligence_run')
      .upsert(
        {
          id: runId,
          account_id: context.accountId,
          deal_id: deal.dealId,
          workflow_run_id: context.runId,
        },
        { onConflict: 'id', ignoreDuplicates: true },
      )
      .throwOnError();
    const { data: checks } = await admin
      .from('diligence_search_check')
      .select('source, subject_key, notes')
      .eq('run_id', runId)
      .throwOnError();
    const searched = new Set(
      checks.map((check) => `${check.source}:${check.subject_key}`),
    );
    const unsearched = (source: Source) =>
      deal.subjects.filter(
        (subject) => !searched.has(`${source}:${subject.key}`),
      );
    const subjectByKey = new Map(
      deal.subjects.map((subject) => [subject.key, subject]),
    );

    async function recordFindings(candidates: Candidate[]) {
      const findings = candidates.map((candidate) => {
        const subject = subjectByKey.get(candidate.subjectKey)!;
        const { identity, ...finding } = findingOf(candidate);
        return {
          ...findingOwner,
          ...finding,
          id: uuidFromKey(
            `diligence_finding:${runId}:${finding.source}:${subject.key}:${identity}`,
          ),
          subject_kind: subject.kind,
          subject_name: subject.name,
          subject_key: subject.key,
          raw: candidate as Json,
        };
      });
      await admin
        .from('diligence_finding')
        .upsert(findings, { onConflict: 'id', ignoreDuplicates: true })
        .throwOnError();
    }

    async function searchAndRecord(
      source: Source,
      subjects: DiligenceSubject[],
      search: (subjects: DiligenceSubject[]) => Promise<Search>,
    ) {
      if (subjects.length === 0) {
        return undefined;
      }
      const result = await search(subjects);
      if ('skipped' in result) {
        return result.skipped;
      }
      await recordFindings(result.candidates);
      await admin
        .from('diligence_search_check')
        .upsert(
          subjects.map((subject) => ({
            run_id: runId,
            source,
            subject_key: subject.key,
          })),
          { onConflict: 'run_id,source,subject_key', ignoreDuplicates: true },
        )
        .throwOnError();
      return undefined;
    }

    async function searchAndRecordLicenses(business: DiligenceSubject) {
      const search = await searchLicenses({
        business,
        state: deal.state,
        signal: context.signal,
      });
      await recordFindings(search.candidates);
      await admin
        .from('diligence_search_check')
        .upsert(
          {
            run_id: runId,
            source: 'licenses',
            subject_key: business.key,
            notes: search.notChecked,
          },
          { onConflict: 'run_id,source,subject_key', ignoreDuplicates: true },
        )
        .throwOnError();
      return search.notChecked;
    }

    async function checkCourtRecords([
      business,
    ]: DiligenceSubject[]): Promise<Search> {
      const key = await providerKey(context.accountId, 'court_records');
      if (!key) {
        return {
          skipped:
            'Connect a court records broker to search state court cases, liens and UCC filings',
        };
      }
      const broker = BROKER_NAME[key.provider];
      const brokerCheck = { run_id: runId, subject_key: business!.key };
      const currentCheck = { ...brokerCheck, broker: key.provider };
      const freshCheck = {
        broker: key.provider,
        state: key.provider === 'baselayer' ? { step: 'search' } : {},
      };
      await admin
        .from('diligence_broker_check')
        .upsert(
          { ...brokerCheck, ...freshCheck },
          { onConflict: 'run_id,subject_key', ignoreDuplicates: true },
        )
        .throwOnError();
      const { data: seen } = await admin
        .from('diligence_broker_check')
        .select('broker, started_at')
        .match(brokerCheck)
        .single()
        .throwOnError();
      const pollAgain = () =>
        new PollAgain(new Date(Date.now() + BROKER_POLL_MS));
      let startedAt = seen.started_at;
      if (seen.broker !== key.provider) {
        startedAt = new Date().toISOString();
        const { data: restarted } = await admin
          .from('diligence_broker_check')
          .update({ ...freshCheck, started_at: startedAt, claimed_at: null })
          .match({ ...brokerCheck, broker: seen.broker })
          .select('run_id')
          .throwOnError();
        if (restarted.length === 0) {
          throw pollAgain();
        }
      }
      const firm = { name: business!.name, city: deal.city, state: deal.state };
      const checkBaselayerFromLastStep = async () => {
        const staleClaim = new Date(
          Date.now() - BROKER_CLAIM_STALE_MS,
        ).toISOString();
        const {
          data: [claim],
        } = await admin
          .from('diligence_broker_check')
          .update({ claimed_at: new Date().toISOString() })
          .match(currentCheck)
          .or(`claimed_at.is.null,claimed_at.lt."${staleClaim}"`)
          .select('state')
          .throwOnError();
        if (!claim) {
          return { status: 'waiting' as const };
        }
        const outcome = await checkBaselayer({
          credentials: key,
          firm,
          check: claim.state as BaselayerCheck,
          signal: context.signal,
        });
        await admin
          .from('diligence_broker_check')
          .update({
            claimed_at: null,
            ...(outcome.status === 'pending' && { state: outcome.check }),
          })
          .match(currentCheck)
          .throwOnError();
        return outcome;
      };
      const outcome =
        key.provider === 'baselayer'
          ? await checkBaselayerFromLastStep()
          : await checkMiddesk({
              credentials: key,
              accountId: context.accountId,
              firmId: deal.firmId,
              firm,
              signal: context.signal,
            });
      const { data: stillCurrent } = await admin
        .from('diligence_broker_check')
        .select('run_id')
        .match(currentCheck)
        .throwOnError();
      if (stillCurrent.length === 0) {
        throw pollAgain();
      }
      switch (outcome.status) {
        case 'done':
          return {
            candidates: outcome.records.map(({ source, raw, ...record }) => ({
              ...record,
              raw: raw as Json,
              source: 'court_records' as const,
              broker: source,
              subjectKey: business!.key,
            })),
          };
        case 'refused':
          return { skipped: `The ${broker} key was refused; reconnect it` };
        case 'no_match':
          return { skipped: 'Broker found no matching business' };
        case 'not_checked':
          return {
            skipped: `${broker} could not search court records for this business`,
          };
        case 'pending':
        case 'waiting':
          if (Date.now() - Date.parse(startedAt) >= BROKER_GIVE_UP_MS) {
            return { skipped: `${broker} did not finish within 24 hours` };
          }
          throw pollAgain();
      }
    }

    const lanes = await Promise.allSettled([
      (async () => {
        for (const subject of unsearched('courts')) {
          const skipped = await searchAndRecord(
            'courts',
            [subject],
            (subjects) =>
              searchFederalCourts({
                accountId: context.accountId,
                subjects,
                state: deal.state,
                signal: context.signal,
              }),
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
      (async () => {
        const businesses = deal.subjects.filter(
          (subject) =>
            subject.kind === 'business' &&
            (config.searchAllNames || subject.sources.includes('firm')),
        );
        const notChecked = new Set<string>();
        for (const business of businesses) {
          const finished = checks.find(
            (check) =>
              check.source === 'licenses' && check.subject_key === business.key,
          );
          const notes = finished
            ? finished.notes!
            : await searchAndRecordLicenses(business);
          notes.forEach((note) => notChecked.add(note));
        }
        return notChecked.size > 0 ? [...notChecked] : undefined;
      })(),
      searchAndRecord(
        'court_records',
        unsearched('court_records').filter(
          (subject) =>
            subject.kind === 'business' && subject.sources.includes('firm'),
        ),
        checkCourtRecords,
      ),
    ]);
    const [courts, news, sanctions, licenses, courtRecords] = lanes;
    return {
      runId,
      skipped: {
        courts: valueOf(courts),
        news: valueOf(news),
        sanctions: valueOf(sanctions),
        licenses: valueOf(licenses),
        court_records: valueOf(courtRecords),
      },
    };
  },
});
