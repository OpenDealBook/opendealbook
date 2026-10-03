'use server';

import { DEFAULT_OUTREACH_SEQUENCES } from '@odb/outreach';
import { enhanceAction } from '@odb/next/actions';
import type { TablesInsert, TablesUpdate } from '@odb/supabase';
import { getSupabaseServerClient } from '@odb/supabase/server';

import {
  connectMailboxSchema,
  createSequenceSchema,
  enrollTargetsSchema,
  seedDefaultSequencesSchema,
  setOutreachSettingSchema,
  suppressEmailSchema,
  updateSequenceSchema,
} from '../schema/outreach.schema';

type StepInput = {
  ordinal: number;
  delayDays: number;
  subject: string;
  body: string;
};

function stepRows(
  accountId: string,
  sequenceId: string,
  steps: StepInput[],
): TablesInsert<'outreach_step'>[] {
  return steps.map((step) => ({
    account_id: accountId,
    sequence_id: sequenceId,
    ordinal: step.ordinal,
    delay_days: step.delayDays,
    subject: step.subject,
    body: step.body,
  }));
}

export const connectMailbox = enhanceAction(
  async (data, user) => {
    const client = getSupabaseServerClient();

    const { data: row, error } = await client
      .from('mailbox_connection')
      .insert({
        account_id: data.accountId,
        user_id: user.id,
        provider: data.provider,
        nango_connection_id: data.nangoConnectionId,
        provider_config_key: data.providerConfigKey,
        email_address: data.emailAddress,
        status: data.status,
      })
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    return row.id;
  },
  { auth: true, schema: connectMailboxSchema },
);

export const seedDefaultSequences = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { data: existing } = await client
      .from('outreach_sequence')
      .select('id')
      .eq('account_id', data.accountId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return { seeded: 0 };
    }

    for (const sequence of DEFAULT_OUTREACH_SEQUENCES) {
      const { data: row, error } = await client
        .from('outreach_sequence')
        .insert({
          account_id: data.accountId,
          name: sequence.name,
          description: sequence.description,
          is_default: true,
        })
        .select('id')
        .single();

      if (error) {
        throw error;
      }

      const { error: stepError } = await client
        .from('outreach_step')
        .insert(stepRows(data.accountId, row.id, sequence.steps));

      if (stepError) {
        throw stepError;
      }
    }

    return { seeded: DEFAULT_OUTREACH_SEQUENCES.length };
  },
  { auth: true, schema: seedDefaultSequencesSchema },
);

export const createSequence = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { data: row, error } = await client
      .from('outreach_sequence')
      .insert({
        account_id: data.accountId,
        name: data.name,
        description: data.description ?? null,
      })
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    if (data.steps.length > 0) {
      await client
        .from('outreach_step')
        .insert(stepRows(data.accountId, row.id, data.steps))
        .throwOnError();
    }

    return row.id;
  },
  { auth: true, schema: createSequenceSchema },
);

export const updateSequence = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const changes: TablesUpdate<'outreach_sequence'> = {};
    if (data.name !== undefined) {
      changes.name = data.name;
    }
    if (data.description !== undefined) {
      changes.description = data.description;
    }
    if (data.enabled !== undefined) {
      changes.enabled = data.enabled;
    }

    await client
      .from('outreach_sequence')
      .update(changes)
      .eq('id', data.sequenceId)
      .eq('account_id', data.accountId)
      .throwOnError();

    if (data.steps !== undefined) {
      await client
        .from('outreach_step')
        .delete()
        .eq('sequence_id', data.sequenceId)
        .throwOnError();

      if (data.steps.length > 0) {
        await client
          .from('outreach_step')
          .insert(stepRows(data.accountId, data.sequenceId, data.steps))
          .throwOnError();
      }
    }

    return data.sequenceId;
  },
  { auth: true, schema: updateSequenceSchema },
);

export const enrollTargets = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();
    const now = new Date().toISOString();

    const inserts: TablesInsert<'outreach_enrollment'>[] = [];
    const skipped: Array<{ type: 'firm' | 'contact'; id: string }> = [];

    for (const contactId of data.contactIds ?? []) {
      const { data: contact } = await client
        .from('contact')
        .select('id, email, firm_id')
        .eq('account_id', data.accountId)
        .eq('id', contactId)
        .maybeSingle();

      if (!contact?.email) {
        skipped.push({ type: 'contact', id: contactId });
        continue;
      }

      inserts.push({
        account_id: data.accountId,
        sequence_id: data.sequenceId,
        contact_id: contact.id,
        firm_id: contact.firm_id,
        target_email: contact.email,
        status: 'queued',
        current_step: 1,
        next_send_at: now,
      });
    }

    for (const firmId of data.firmIds ?? []) {
      const { data: contacts } = await client
        .from('contact')
        .select('id, email')
        .eq('account_id', data.accountId)
        .eq('firm_id', firmId);

      const reachable = (contacts ?? []).find((contact) => contact.email);

      if (!reachable?.email) {
        skipped.push({ type: 'firm', id: firmId });
        continue;
      }

      inserts.push({
        account_id: data.accountId,
        sequence_id: data.sequenceId,
        firm_id: firmId,
        contact_id: reachable.id,
        target_email: reachable.email,
        status: 'queued',
        current_step: 1,
        next_send_at: now,
      });
    }

    if (inserts.length === 0) {
      return { enrolled: [], skipped };
    }

    const { data: rows, error } = await client
      .from('outreach_enrollment')
      .insert(inserts)
      .select('id');

    if (error) {
      throw error;
    }

    return { enrolled: rows.map((row) => row.id), skipped };
  },
  { auth: true, schema: enrollTargetsSchema },
);

export const setOutreachSetting = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    await client
      .from('outreach_setting')
      .upsert(
        {
          account_id: data.accountId,
          daily_cap: data.dailyCap,
          max_touches: data.maxTouches,
        },
        { onConflict: 'account_id' },
      )
      .throwOnError();

    return { success: true };
  },
  { auth: true, schema: setOutreachSettingSchema },
);

export const suppressEmail = enhanceAction(
  async (data) => {
    const client = getSupabaseServerClient();

    const { data: row, error } = await client
      .from('outreach_suppression')
      .insert({
        account_id: data.accountId,
        email: data.email,
        reason: data.reason,
      })
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    return row.id;
  },
  { auth: true, schema: suppressEmailSchema },
);
