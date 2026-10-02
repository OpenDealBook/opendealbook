'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import type { DealCalcInputs } from '@odb/deals/schema';
import { fetchCalcVersion } from '@odb/deals/shared';
import {
  adoptCalcVersion,
  createCalcVersion,
  deleteCalcVersion,
  duplicateCalcVersion,
  markPrimaryCalcVersion,
} from '@odb/deals/server';
import type { Tables } from '@odb/supabase';
import { getSupabaseBrowserClient } from '@odb/supabase/client';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import { CalcDealEditor } from './calc-deal-editor';
import {
  type DealDraft,
  type SdePeriodDraft,
  type WorkingCapitalDraft,
  dealDraftFromInputs,
  emptyDealDraft,
  emptyWorkingCapitalDraft,
  money,
  periodDraftsFromRows,
  ratio,
  workingCapitalDraftFromInputs,
} from './calc-shared';
import { CalcSdeEditor } from './calc-sde-editor';
import { CalcWorkingCapitalEditor } from './calc-working-capital-editor';

type CalcVersion = Tables<'calc_version'>;

type OpenEditor =
  | { kind: 'sde'; id: string; periods: SdePeriodDraft[] }
  | { kind: 'deal'; id: string; draft: DealDraft }
  | { kind: 'working_capital'; id: string; draft: WorkingCapitalDraft };

interface Snapshot {
  weighted_sde?: number;
  dscr?: number | null;
  purchase_multiple?: number | null;
  working_capital?: number;
}

const TYPE_LABELS: Record<string, string> = {
  sde: 'SDE',
  deal: 'Deal',
  working_capital: 'Working capital',
};

function versionName(version: CalcVersion): string {
  if (version.name != null && version.name.trim() !== '') {
    return version.name;
  }
  return `${TYPE_LABELS[version.type ?? ''] ?? 'Calculator'} version`;
}

function keyOutputs(version: CalcVersion): string {
  const snapshot = version.outputs_snapshot as unknown as Snapshot;
  if (version.type === 'sde') {
    return `Weighted SDE ${money(snapshot.weighted_sde ?? null)}`;
  }
  if (version.type === 'deal') {
    return `DSCR ${ratio(snapshot.dscr ?? null)} · Multiple ${ratio(
      snapshot.purchase_multiple ?? null,
    )}`;
  }
  if (version.type === 'working_capital') {
    return `Working capital ${money(snapshot.working_capital ?? null)}`;
  }
  return 'n/a';
}

export function CalculatorsPanel(props: {
  dealId: string;
  versions: CalcVersion[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<OpenEditor | null>(null);

  const sdeVersions = props.versions
    .filter((version) => version.type === 'sde')
    .map((version) => ({ id: version.id, name: versionName(version) }));

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  async function openVersion(version: CalcVersion) {
    setLoading(true);
    const detail = await fetchCalcVersion(getSupabaseBrowserClient(), {
      calc_version_id: version.id,
    });
    if (version.type === 'sde') {
      setOpen({
        kind: 'sde',
        id: version.id,
        periods: periodDraftsFromRows(detail.periods ?? []),
      });
    } else if (version.type === 'deal') {
      const inputs = (detail.input?.inputs ?? null) as DealCalcInputs | null;
      setOpen({
        kind: 'deal',
        id: version.id,
        draft:
          inputs == null
            ? emptyDealDraft()
            : dealDraftFromInputs(
                inputs,
                detail.funding_sources ?? [],
                detail.input?.imported_from_version_id ?? null,
              ),
      });
    } else if (version.type === 'working_capital') {
      const inputs = (detail.input?.inputs ?? {}) as {
        current_assets?: number;
        current_liabilities?: number;
        avg_monthly_revenue?: number;
      };
      setOpen({
        kind: 'working_capital',
        id: version.id,
        draft: workingCapitalDraftFromInputs(inputs),
      });
    }
    setLoading(false);
  }

  async function newVersion(type: 'sde' | 'deal' | 'working_capital') {
    setLoading(true);
    const id = await createCalcVersion({ deal_id: props.dealId, type });
    router.refresh();
    if (type === 'sde') {
      setOpen({ kind: 'sde', id, periods: [] });
    } else if (type === 'deal') {
      setOpen({ kind: 'deal', id, draft: emptyDealDraft() });
    } else {
      setOpen({ kind: 'working_capital', id, draft: emptyWorkingCapitalDraft() });
    }
    setLoading(false);
  }

  return (
    <div className={'flex flex-col gap-4'}>
      <div className={'flex flex-wrap gap-2'}>
        <Button size={'sm'} disabled={loading} onClick={() => newVersion('sde')}>
          New SDE
        </Button>
        <Button size={'sm'} disabled={loading} onClick={() => newVersion('deal')}>
          New Deal
        </Button>
        <Button
          size={'sm'}
          disabled={loading}
          onClick={() => newVersion('working_capital')}
        >
          New Working capital
        </Button>
      </div>

      {props.versions.length === 0 ? (
        <p className={'text-muted-foreground text-sm'}>No calculators yet</p>
      ) : (
        <div className={'overflow-x-auto'}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Primary</TableHead>
                <TableHead>Key outputs</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.versions.map((version) => (
                <TableRow key={version.id}>
                  <TableCell>{versionName(version)}</TableCell>
                  <TableCell>{TYPE_LABELS[version.type ?? ''] ?? version.type}</TableCell>
                  <TableCell>
                    {version.is_primary ? <Badge>Primary</Badge> : null}
                  </TableCell>
                  <TableCell>{keyOutputs(version)}</TableCell>
                  <TableCell>
                    <div className={'flex flex-wrap gap-1'}>
                      <Button
                        variant={'outline'}
                        size={'sm'}
                        disabled={loading}
                        onClick={() => openVersion(version)}
                      >
                        Open
                      </Button>
                      <Button
                        variant={'outline'}
                        size={'sm'}
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            duplicateCalcVersion({ calc_version_id: version.id }),
                          )
                        }
                      >
                        Duplicate
                      </Button>
                      <Button
                        variant={'outline'}
                        size={'sm'}
                        disabled={pending || version.is_primary}
                        onClick={() =>
                          run(() =>
                            markPrimaryCalcVersion({ calc_version_id: version.id }),
                          )
                        }
                      >
                        Mark primary
                      </Button>
                      <Button
                        variant={'outline'}
                        size={'sm'}
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            adoptCalcVersion({
                              deal_id: props.dealId,
                              calc_version_id: version.id,
                            }),
                          )
                        }
                      >
                        Adopt
                      </Button>
                      <Button
                        variant={'destructive'}
                        size={'sm'}
                        disabled={pending}
                        onClick={() => {
                          if (open?.id === version.id) {
                            setOpen(null);
                          }
                          run(() =>
                            deleteCalcVersion({ calc_version_id: version.id }),
                          );
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {open !== null && (
        <div className={'flex flex-col gap-3 rounded-md border p-4'}>
          <div className={'flex items-center justify-between'}>
            <h3 className={'text-sm font-semibold'}>
              {TYPE_LABELS[open.kind]} editor
            </h3>
            <Button variant={'ghost'} size={'sm'} onClick={() => setOpen(null)}>
              Close
            </Button>
          </div>
          {open.kind === 'sde' && (
            <CalcSdeEditor
              calcVersionId={open.id}
              initialPeriods={open.periods}
              onClose={() => setOpen(null)}
            />
          )}
          {open.kind === 'deal' && (
            <CalcDealEditor
              calcVersionId={open.id}
              initial={open.draft}
              sdeVersions={sdeVersions}
              onClose={() => setOpen(null)}
            />
          )}
          {open.kind === 'working_capital' && (
            <CalcWorkingCapitalEditor
              calcVersionId={open.id}
              initial={open.draft}
              onClose={() => setOpen(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}
