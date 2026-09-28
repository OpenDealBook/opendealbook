import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Json, Tables } from '@tuckin/supabase';

import { parseWorkbookConfig } from './config';
import type { WorkbookScheduleClient } from './schedule';

export interface WorkbookDeps {
  client: SupabaseClient<Database>;
  schedule: WorkbookScheduleClient;
}

export interface InstallWorkbookInput {
  accountId: string;
  templateId: string;
  config: unknown;
}

export async function installWorkbook(
  input: InstallWorkbookInput,
  deps: WorkbookDeps,
): Promise<Tables<'workbook'>> {
  const { data: template, error: templateError } = await deps.client
    .from('workbook_template')
    .select('workflow_type')
    .eq('id', input.templateId)
    .single();

  if (templateError) {
    throw templateError;
  }

  const config = parseWorkbookConfig(template.workflow_type, input.config);

  const { data: workbook, error } = await deps.client
    .from('workbook')
    .insert({
      account_id: input.accountId,
      template_id: input.templateId,
      config_json: config as unknown as NonNullable<Json>,
      status: 'active',
    })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  await deps.schedule.startWorkbookSchedule({
    workbookId: workbook.id,
    accountId: input.accountId,
    config,
  });

  return workbook;
}

export async function listWorkbooks(
  accountId: string,
  client: SupabaseClient<Database>,
): Promise<Tables<'workbook'>[]> {
  const { data, error } = await client
    .from('workbook')
    .select('*')
    .eq('account_id', accountId);

  if (error) {
    throw error;
  }

  return data;
}

export async function pauseWorkbook(
  workbookId: string,
  deps: WorkbookDeps,
): Promise<Tables<'workbook'>> {
  await deps.schedule.pauseWorkbookSchedule(workbookId);

  return setWorkbookStatus(workbookId, 'paused', deps.client);
}

export async function resumeWorkbook(
  workbookId: string,
  deps: WorkbookDeps,
): Promise<Tables<'workbook'>> {
  await deps.schedule.resumeWorkbookSchedule(workbookId);

  return setWorkbookStatus(workbookId, 'active', deps.client);
}

export async function getRuns(
  workbookId: string,
  client: SupabaseClient<Database>,
): Promise<Tables<'workbook_run'>[]> {
  const { data, error } = await client
    .from('workbook_run')
    .select('*')
    .eq('workbook_id', workbookId)
    .order('started_at', { ascending: false });

  if (error) {
    throw error;
  }

  return data;
}

export async function loadWorkbookAccountId(
  workbookId: string,
  client: SupabaseClient<Database>,
): Promise<string> {
  const { data, error } = await client
    .from('workbook')
    .select('account_id')
    .eq('id', workbookId)
    .single();

  if (error) {
    throw error;
  }

  return data.account_id;
}

async function setWorkbookStatus(
  workbookId: string,
  status: string,
  client: SupabaseClient<Database>,
): Promise<Tables<'workbook'>> {
  const { data, error } = await client
    .from('workbook')
    .update({ status })
    .eq('id', workbookId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}
