import { afterAll, describe, expect, it } from 'vitest';

import type { NovuClient } from '@odb/notifications/server';

import {
  admin,
  removeEverythingSeeded,
} from '../../asks/integration-harness';
import { emailLendersToNudge } from './daily-email';
import { seedQuietTeam } from './test-support';

const EIGHT_UTC = new Date('2026-10-18T08:05:00Z');
const NINE_UTC = new Date('2026-10-18T09:05:00Z');
const EIGHT_NEW_YORK = new Date('2026-10-18T12:05:00Z');

function recordingNovu() {
  const sent: { workflowId: string; data: Parameters<NovuClient['trigger']>[1] }[] =
    [];
  const novu: NovuClient = {
    trigger: async (workflowId, data) => {
      sent.push({ workflowId, data });
    },
    subscribers: { identify: async () => undefined },
  };

  return { novu, sent };
}

afterAll(removeEverythingSeeded);

describe('emailLendersToNudge (integration)', () => {
  it("emails each deal manager the team's quiet lenders at 8am UTC when they set no timezone, once per day", async () => {
    const { owner, teamId } = await seedQuietTeam(30);
    const { data: team } = await admin
      .from('accounts')
      .select('slug')
      .eq('id', teamId)
      .single()
      .throwOnError();
    const { novu, sent } = recordingNovu();

    await emailLendersToNudge({ admin, novu }, teamId, EIGHT_UTC);
    await emailLendersToNudge({ admin, novu }, teamId, EIGHT_UTC);

    const transactionId = `lender-nudges.daily/${teamId}/${owner.userId}/2026-10-18`;
    expect(sent).toEqual([
      {
        workflowId: 'lender-nudges.daily',
        data: {
          to: { subscriberId: owner.userId },
          payload: {
            accountSlug: team.slug,
            lenders: [
              {
                lenderName: 'Quiet Bank',
                deals: [{ dealName: 'Lender asks deal', daysSilent: 30 }],
              },
            ],
          },
          transactionId,
        },
      },
      expect.objectContaining({
        data: expect.objectContaining({ transactionId }),
      }),
    ]);
  });

  it('sends nothing outside 8am in the recipient timezone', async () => {
    const { teamId } = await seedQuietTeam(30);
    const { novu, sent } = recordingNovu();

    await emailLendersToNudge({ admin, novu }, teamId, NINE_UTC);

    expect(sent).toEqual([]);
  });

  it("sends at 8am in the recipient's own timezone, keyed by their local date", async () => {
    const { owner, teamId } = await seedQuietTeam(30);
    await admin
      .from('accounts')
      .update({ timezone: 'America/New_York' })
      .eq('id', owner.userId)
      .throwOnError();
    const atUtcEight = recordingNovu();
    const atNewYorkEight = recordingNovu();

    await emailLendersToNudge(
      { admin, novu: atUtcEight.novu },
      teamId,
      EIGHT_UTC,
    );
    await emailLendersToNudge(
      { admin, novu: atNewYorkEight.novu },
      teamId,
      EIGHT_NEW_YORK,
    );

    expect(atUtcEight.sent).toEqual([]);
    expect(atNewYorkEight.sent.map((s) => s.data.transactionId)).toEqual([
      `lender-nudges.daily/${teamId}/${owner.userId}/2026-10-18`,
    ]);
  });

  it('sends nothing on a day the team has no lender due', async () => {
    const { teamId } = await seedQuietTeam(1);
    const { novu, sent } = recordingNovu();

    await emailLendersToNudge({ admin, novu }, teamId, EIGHT_UTC);

    expect(sent).toEqual([]);
  });

  it('skips a deal manager who turned the daily email off', async () => {
    const { owner, teamId } = await seedQuietTeam(30);
    await admin
      .from('notification_preference')
      .insert({
        account_id: teamId,
        recipient_user_id: owner.userId,
        channel: 'email',
        event_type: 'lender-nudges.daily',
        enabled: false,
      })
      .throwOnError();
    const { novu, sent } = recordingNovu();

    await emailLendersToNudge({ admin, novu }, teamId, EIGHT_UTC);

    expect(sent).toEqual([]);
  });

  it('sends nothing to a team locked for billing', async () => {
    const { teamId } = await seedQuietTeam(30);
    await admin
      .from('accounts')
      .update({
        trial_ends_at: new Date(Date.now() - 86_400_000).toISOString(),
      })
      .eq('id', teamId)
      .throwOnError();
    const { novu, sent } = recordingNovu();

    await emailLendersToNudge({ admin, novu }, teamId, EIGHT_UTC);

    expect(sent).toEqual([]);
  });
});
