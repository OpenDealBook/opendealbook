import { beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({
  locked: false,
  approve: null as null | (() => void),
  unansweredRounds: 0,
  stopCadenceAfter: 1,
  activities: {
    isTeamLocked: vi.fn(async () => world.locked),
    createNotification: vi.fn(async () => {}),
    loadBrokerContacts: vi.fn(async () => [{ id: 'broker-1' }]),
    computeExcludedBrokers: vi.fn(async () => []),
    sendBrokerBatchEmail: vi.fn(async () => ({ sent: 1 })),
    createBrokerFollowUpTask: vi.fn(async () => {}),
    recordWorkbookRun: vi.fn(async () => {}),
  },
}));

vi.mock('@temporalio/workflow', () => {
  let stop: (() => void) | undefined;
  let sleeps = 0;

  return {
    proxyActivities: () => world.activities,
    defineSignal: (name: string) => name,
    setHandler: (signal: string, handler: () => void) => {
      if (signal === 'approveBrokerCatchUp') {
        world.approve = handler;
      } else {
        stop = handler;
        sleeps = 0;
      }
    },
    sleep: async () => {
      sleeps += 1;
      if (sleeps > world.stopCadenceAfter) {
        stop?.();
      }
    },
    condition: async (predicate: () => boolean) => {
      if (world.unansweredRounds > 0) {
        world.unansweredRounds -= 1;
        return false;
      }
      world.approve?.();
      return predicate();
    },
  };
});

import { announcementSchedule } from './announcementSchedule';
import { brokerCatchUp } from './brokerCatchUp';
import { weeklyMeetingCadence } from './weeklyMeetingCadence';

const config = {
  dealLeadUserId: 'lead-1',
  fromEmail: 'lead@odb.test',
  subject: 'Catching up',
  updates: 'News',
  bookACallUrl: 'https://cal.test',
};

describe('scheduled work for a locked team', () => {
  beforeEach(() => {
    world.locked = false;
    world.approve = null;
    world.unansweredRounds = 0;
    Object.values(world.activities).forEach((activity) => activity.mockClear());
  });

  it('skips a workbook run due while locked', async () => {
    world.locked = true;

    await brokerCatchUp({ workbookId: 'wb-1', accountId: 'team-1', config });

    expect(world.activities.sendBrokerBatchEmail).not.toHaveBeenCalled();
    expect(world.activities.recordWorkbookRun).not.toHaveBeenCalled();
  });

  it('runs a workbook normally once unlocked', async () => {
    await brokerCatchUp({ workbookId: 'wb-1', accountId: 'team-1', config });

    expect(world.activities.sendBrokerBatchEmail).toHaveBeenCalledTimes(1);
  });

  it('skips an approval reminder due while locked', async () => {
    world.locked = true;
    world.unansweredRounds = 1;

    await brokerCatchUp({ workbookId: 'wb-1', accountId: 'team-1', config });

    expect(world.activities.createNotification).not.toHaveBeenCalled();
  });

  it('sends an approval reminder while unlocked', async () => {
    world.unansweredRounds = 1;

    await brokerCatchUp({ workbookId: 'wb-1', accountId: 'team-1', config });

    expect(world.activities.createNotification).toHaveBeenCalledTimes(1);
  });

  it('skips a meeting reminder due while locked', async () => {
    world.locked = true;

    await weeklyMeetingCadence({
      dealId: 'deal-1',
      accountId: 'team-1',
      recipientUserId: 'lead-1',
    });

    expect(world.activities.createNotification).not.toHaveBeenCalled();
  });

  it('sends a meeting reminder while unlocked', async () => {
    await weeklyMeetingCadence({
      dealId: 'deal-1',
      accountId: 'team-1',
      recipientUserId: 'lead-1',
    });

    expect(world.activities.createNotification).toHaveBeenCalledTimes(1);
  });

  it('skips an announcement due while locked and sends the next one after unlock', async () => {
    world.activities.isTeamLocked
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await announcementSchedule({
      dealId: 'deal-1',
      accountId: 'team-1',
      recipientUserId: 'lead-1',
      items: [
        { label: 'Kickoff', at: new Date().toISOString() },
        { label: 'Close', at: new Date().toISOString() },
      ],
    });

    expect(world.activities.createNotification).toHaveBeenCalledTimes(1);
    expect(world.activities.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Announcement: Close' }),
    );
  });
});
