'use server';

import { z } from 'zod';

import { enhanceAction } from '@tuckin/next/actions';
import { getSupabaseServerClient } from '@tuckin/supabase/server';

import {
  getRuns,
  installWorkbook,
  listWorkbooks,
  loadWorkbookAccountId,
  pauseWorkbook,
  resumeWorkbook,
} from './install';
import { assertDealsManager } from './permissions';
import { createWorkbookScheduleClient } from './schedule';

const installSchema = z.object({
  accountId: z.string().min(1),
  templateId: z.string().min(1),
  config: z.unknown(),
});

const accountSchema = z.object({
  accountId: z.string().min(1),
});

const workbookSchema = z.object({
  workbookId: z.string().min(1),
});

export const installWorkbookAction = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    await assertDealsManager(client, input.accountId, user.id);

    return installWorkbook(input, {
      client,
      schedule: createWorkbookScheduleClient(),
    });
  },
  { auth: true, schema: installSchema },
);

export const listWorkbooksAction = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();

    await assertDealsManager(client, input.accountId, user.id);

    return listWorkbooks(input.accountId, client);
  },
  { auth: true, schema: accountSchema },
);

export const pauseWorkbookAction = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();
    const accountId = await loadWorkbookAccountId(input.workbookId, client);

    await assertDealsManager(client, accountId, user.id);

    return pauseWorkbook(input.workbookId, {
      client,
      schedule: createWorkbookScheduleClient(),
    });
  },
  { auth: true, schema: workbookSchema },
);

export const resumeWorkbookAction = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();
    const accountId = await loadWorkbookAccountId(input.workbookId, client);

    await assertDealsManager(client, accountId, user.id);

    return resumeWorkbook(input.workbookId, {
      client,
      schedule: createWorkbookScheduleClient(),
    });
  },
  { auth: true, schema: workbookSchema },
);

export const getRunsAction = enhanceAction(
  async (input, user) => {
    const client = getSupabaseServerClient();
    const accountId = await loadWorkbookAccountId(input.workbookId, client);

    await assertDealsManager(client, accountId, user.id);

    return getRuns(input.workbookId, client);
  },
  { auth: true, schema: workbookSchema },
);
