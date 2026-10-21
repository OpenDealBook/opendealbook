'use client';

import { useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  adoptCalcVersion,
  createCalcVersion,
  deleteCalcVersion,
  duplicateCalcVersion,
  markPrimaryCalcVersion,
} from '@odb/deals/server';
import { outputsSaved } from '@odb/deals/shared';
import type { Tables } from '@odb/supabase';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@odb/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@odb/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import { TYPE_LABELS, money, ratio, versionName } from './calc-shared';
import { useRefusableAction } from './use-refusable-action';

type CalcVersion = Tables<'calc_version'>;

interface Snapshot {
  weighted_sde?: number;
  dscr?: number | null;
  purchase_multiple?: number | null;
  working_capital?: number;
}

function keyOutputs(version: CalcVersion): string {
  const snapshot = version.outputs_snapshot as unknown as Snapshot;
  if (version.type === 'sde') {
    return `Weighted SDE ${money(snapshot.weighted_sde ?? null)}`;
  }
  if (version.type === 'deal') {
    return `DSCR ${ratio(snapshot.dscr ?? null)} · Purchase multiple incl. closing costs ${ratio(
      snapshot.purchase_multiple ?? null,
    )}`;
  }
  if (version.type === 'working_capital') {
    return `Working capital ${money(snapshot.working_capital ?? null)}`;
  }
  return 'n/a';
}

function adoptable(version: CalcVersion): boolean {
  return (
    version.type !== 'working_capital' && outputsSaved(version.outputs_snapshot)
  );
}

export function CalculatorsPanel(props: {
  dealId: string;
  versions: CalcVersion[];
  canManage: boolean;
  calcsHref: string;
}) {
  const router = useRouter();
  const { refusal, pending, run } = useRefusableAction();
  const [deleting, setDeleting] = useState<CalcVersion | null>(null);
  const primaries = new Map(
    props.versions
      .filter((version) => version.is_primary)
      .map((version) => [version.type, version.id]),
  );

  function newVersion(type: 'sde' | 'deal' | 'working_capital') {
    run(
      () => createCalcVersion({ deal_id: props.dealId, type }),
      (id) => router.push(`${props.calcsHref}/${id}`),
    );
  }

  return (
    <div className={'flex flex-col gap-4'}>
      <div className={'flex flex-wrap gap-2'}>
        <Button
          size={'sm'}
          disabled={pending}
          onClick={() => newVersion('sde')}
        >
          New SDE
        </Button>
        <Button
          size={'sm'}
          disabled={pending}
          onClick={() => newVersion('deal')}
        >
          New Deal
        </Button>
        <Button
          size={'sm'}
          disabled={pending}
          onClick={() => newVersion('working_capital')}
        >
          New Working capital
        </Button>
      </div>
      {refusal ? (
        <p role={'alert'} className={'text-destructive text-sm'}>
          {refusal}
        </p>
      ) : null}

      {props.canManage ? null : (
        <p className={'text-muted-foreground text-sm'}>
          Only deal managers can mark a calc primary or adopt it.
        </p>
      )}

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
                  <TableCell>
                    <Link
                      href={`${props.calcsHref}/${version.id}`}
                      className={
                        'font-medium underline-offset-4 hover:underline'
                      }
                    >
                      {versionName(version, props.versions)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {TYPE_LABELS[version.type ?? ''] ?? version.type}
                  </TableCell>
                  <TableCell>
                    {version.is_primary ? <Badge>Primary</Badge> : null}
                  </TableCell>
                  <TableCell>{keyOutputs(version)}</TableCell>
                  <TableCell>
                    <div className={'flex gap-1'}>
                      <Button variant={'outline'} size={'sm'} asChild>
                        <Link href={`${props.calcsHref}/${version.id}`}>
                          Open
                        </Link>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant={'ghost'}
                            size={'sm'}
                            aria-label={'More actions'}
                            disabled={pending}
                          >
                            ...
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align={'end'}>
                          <DropdownMenuItem
                            disabled={!props.canManage || version.is_primary}
                            onSelect={() =>
                              run(() =>
                                markPrimaryCalcVersion({
                                  calc_version_id: version.id,
                                }),
                              )
                            }
                          >
                            Mark primary
                          </DropdownMenuItem>
                          {adoptable(version) ? (
                            <DropdownMenuItem
                              disabled={!props.canManage}
                              onSelect={() =>
                                run(() =>
                                  adoptCalcVersion({
                                    deal_id: props.dealId,
                                    calc_version_id: version.id,
                                  }),
                                )
                              }
                            >
                              Adopt
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem
                            onSelect={() =>
                              run(() =>
                                duplicateCalcVersion({
                                  calc_version_id: version.id,
                                }),
                              )
                            }
                          >
                            Duplicate
                          </DropdownMenuItem>
                          {primaries.has(version.type) &&
                          !version.is_primary ? (
                            <DropdownMenuItem asChild>
                              <Link
                                href={`${props.calcsHref}/compare?a=${version.id}&b=${primaries.get(version.type)}`}
                              >
                                Compare
                              </Link>
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem
                            variant={'destructive'}
                            onSelect={() => setDeleting(version)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={deleting !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setDeleting(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {deleting === null ? null : versionName(deleting, props.versions)}?
            </DialogTitle>
            <DialogDescription>You can't undo this.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant={'outline'} onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button
              variant={'destructive'}
              disabled={pending}
              onClick={() => {
                const id = deleting!.id;
                setDeleting(null);
                run(() => deleteCalcVersion({ calc_version_id: id }));
              }}
            >
              Delete version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
