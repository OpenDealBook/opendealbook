import { ApplicationFailure } from '@temporalio/common';
import { z } from 'zod';

import { getSupabaseServerAdminClient } from '@odb/supabase/admin';

import { uuidFromKey } from '../../uuidFromKey';
import { NODE_CONFIG_SCHEMAS } from '../graph';
import { defineStep } from '../step';
import { teamRow } from '../teamRow';

const UNIQUE_VIOLATION = '23505';
const LIVE_STATUSES = ['queued', 'held', 'sent'];

export const enrollSequence = defineStep({
  type: 'enroll_sequence',
  runOnce: false,
  configSchema: NODE_CONFIG_SCHEMAS.enroll_sequence,
  inputSchema: z.object({}),
  outputSchema: z.object({ enrollmentId: z.string() }),
  async run({ context, config }) {
    const admin = getSupabaseServerAdminClient();
    const enrollments = () =>
      admin
        .from('outreach_enrollment')
        .select('id', { count: 'exact' })
        .eq('account_id', context.accountId)
        .eq('firm_id', config.firmId)
        .eq('sequence_id', config.sequenceId);
    const liveEnrollment = async () =>
      (await enrollments().in('status', LIVE_STATUSES).maybeSingle().throwOnError()).data;

    const sequence = await teamRow(config.sequenceId, 'That sequence is not on this team', (id) =>
      admin
        .from('outreach_sequence')
        .select('enabled')
        .eq('id', id)
        .eq('account_id', context.accountId)
        .maybeSingle()
        .throwOnError(),
    );
    if (!sequence.enabled) {
      throw ApplicationFailure.nonRetryable('This sequence is turned off');
    }

    const live = await liveEnrollment();
    if (live !== null) {
      return { enrollmentId: live.id };
    }

    const { data: contact } = await admin
      .from('contact')
      .select('id, email')
      .eq('account_id', context.accountId)
      .eq('firm_id', config.firmId)
      .not('email', 'is', null)
      .order('created_at')
      .order('id')
      .limit(1)
      .maybeSingle()
      .throwOnError();
    if (contact === null) {
      throw ApplicationFailure.nonRetryable('This firm has no email');
    }

    const { data: latest } = await admin
      .from('firm_verdict')
      .select('firm_verdict_approval(firm_verdict_revocation(verdict_id))')
      .eq('firm_id', config.firmId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()
      .throwOnError();
    if (latest?.firm_verdict_approval?.firm_verdict_revocation.length) {
      throw ApplicationFailure.nonRetryable("This firm's approval was revoked.");
    }

    const { data: approved } = await admin
      .rpc('firm_outreach_approved', { p_firm_id: config.firmId })
      .throwOnError();

    const { count: earlierAttempts } = await enrollments().throwOnError();
    const enrollmentId = uuidFromKey(`workflow_step:${context.idempotencyKey}:${earlierAttempts}`);
    const { error } = await admin.from('outreach_enrollment').insert({
      id: enrollmentId,
      account_id: context.accountId,
      sequence_id: config.sequenceId,
      firm_id: config.firmId,
      contact_id: contact.id,
      target_email: contact.email!,
      status: approved ? 'queued' : 'held',
    });
    if (error?.code === UNIQUE_VIOLATION) {
      return { enrollmentId: (await liveEnrollment())!.id };
    }
    if (error) {
      throw error;
    }

    return { enrollmentId };
  },
});
