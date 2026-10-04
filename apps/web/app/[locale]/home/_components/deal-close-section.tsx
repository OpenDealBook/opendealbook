'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';

import {
  createClientTransition,
  updateClientTransitionStep,
} from '@odb/close/server';
import {
  type ChecklistStatus,
  type TransitionStep,
  checklistStatusSchema,
  transitionStepSchema,
} from '@odb/close/schema';
import { fetchClientTransitions } from '@odb/close/shared';
import type { Tables } from '@odb/supabase';
import { useSupabase } from '@odb/supabase/hooks';
import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { Input } from '@odb/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

const STEP_COLUMN: Record<TransitionStep, keyof Tables<'client_transition'>> = {
  engagement_letter: 'engagement_letter_status',
  consent_7216: 'consent_7216_status',
  efile_auth: 'efile_auth_status',
  portal_migration: 'portal_migration_status',
};

const STEP_LABEL: Record<TransitionStep, string> = {
  engagement_letter: 'Engagement letter',
  consent_7216: '7216 consent',
  efile_auth: 'E-file auth',
  portal_migration: 'Portal migration',
};

const STATUS_LABEL: Record<ChecklistStatus, string> = {
  not_started: 'Not started',
  requested: 'Requested',
  received: 'Received',
  reviewed: 'Reviewed',
};

export function DealCloseSection({
  dealId,
  accountId,
}: {
  dealId: string;
  accountId: string;
}) {
  const client = useSupabase();
  const [transitions, setTransitions] = useState<
    Tables<'client_transition'>[]
  >([]);
  const [clientName, setClientName] = useState('');
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    fetchClientTransitions(client, dealId).then(setTransitions);
  }, [client, dealId]);

  useEffect(() => {
    load();
  }, [load]);

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action();
      load();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Client transitions</CardTitle>
      </CardHeader>
      <CardContent className={'flex flex-col gap-6'}>
        <form
          className={'flex items-end gap-2'}
          onSubmit={(event) => {
            event.preventDefault();
            run(async () => {
              await createClientTransition({
                account_id: accountId,
                deal_id: dealId,
                client_name: clientName.trim(),
              });
              setClientName('');
            });
          }}
        >
          <Input
            value={clientName}
            onChange={(event) => setClientName(event.target.value)}
            placeholder={'Client name'}
            className={'w-56'}
          />
          <Button
            type={'submit'}
            variant={'outline'}
            disabled={pending || clientName.trim() === ''}
          >
            Add client
          </Button>
        </form>

        {transitions.length === 0 ? (
          <p className={'text-muted-foreground text-sm'}>No clients yet</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                {transitionStepSchema.options.map((step) => (
                  <TableHead key={step}>{STEP_LABEL[step]}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {transitions.map((transition) => (
                <TableRow key={transition.id}>
                  <TableCell>{transition.client_name}</TableCell>
                  {transitionStepSchema.options.map((step) => (
                    <TableCell key={step}>
                      <Select
                        value={transition[STEP_COLUMN[step]] as ChecklistStatus}
                        onValueChange={(status) =>
                          run(() =>
                            updateClientTransitionStep({
                              id: transition.id,
                              step,
                              status: status as ChecklistStatus,
                            }),
                          )
                        }
                      >
                        <SelectTrigger className={'w-40'} disabled={pending}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {checklistStatusSchema.options.map((status) => (
                            <SelectItem key={status} value={status}>
                              {STATUS_LABEL[status]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
