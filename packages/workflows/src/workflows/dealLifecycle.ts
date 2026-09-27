import {
  condition,
  proxyActivities,
  setHandler,
  startChild,
} from '@temporalio/workflow';

import type * as activities from '../activities';
import { announcementSchedule } from './announcementSchedule';
import { dataRoomProvisioning } from './dataRoomProvisioning';
import { loiNegotiation } from './loiNegotiation';
import {
  advanceStage,
  counselAcceptedTurn,
  currentStage,
  sellerUploaded,
  type DealStage,
} from './signals';
import { weeklyMeetingCadence } from './weeklyMeetingCadence';

const { writeAuditEvent } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 minute',
});

type ActiveStage = Exclude<DealStage, 'closed'>;

export interface DealLifecycleInput {
  dealId: string;
  accountId: string;
  actorUserId: string;
}

async function startStageChild(
  stage: ActiveStage,
  input: DealLifecycleInput,
): Promise<void> {
  const { dealId, accountId, actorUserId } = input;

  switch (stage) {
    case 'loi':
      await startChild(loiNegotiation, {
        workflowId: `${dealId}-loi`,
        args: [{ dealId, exclusivityWindow: '30 days' }],
      });
      return;
    case 'data_room':
      await startChild(dataRoomProvisioning, {
        workflowId: `${dealId}-data-room`,
        args: [{ dealId, reminderInterval: '2 days' }],
      });
      return;
    case 'meetings':
      await startChild(weeklyMeetingCadence, {
        workflowId: `${dealId}-meetings`,
        args: [{ dealId, accountId, recipientUserId: actorUserId }],
      });
      return;
    case 'announcement':
      await startChild(announcementSchedule, {
        workflowId: `${dealId}-announcement`,
        args: [{ dealId, accountId, recipientUserId: actorUserId, items: [] }],
      });
      return;
  }
}

export async function dealLifecycle(input: DealLifecycleInput): Promise<void> {
  const { dealId, accountId, actorUserId } = input;
  let stage: DealStage = 'loi';
  let requested: DealStage | undefined;

  setHandler(advanceStage, (next) => {
    requested = next;
  });
  setHandler(sellerUploaded, async (payload) => {
    await writeAuditEvent({
      accountId,
      dealId,
      actorUserId,
      eventType: 'seller_uploaded',
      payload,
    });
  });
  setHandler(counselAcceptedTurn, async (payload) => {
    await writeAuditEvent({
      accountId,
      dealId,
      actorUserId,
      eventType: 'counsel_accepted_turn',
      payload,
    });
  });
  setHandler(currentStage, () => stage);

  await writeAuditEvent({
    accountId,
    dealId,
    actorUserId,
    eventType: `stage_entered:${stage}`,
    payload: { stage },
  });
  await startStageChild(stage, input);

  while (stage !== 'closed') {
    await condition(() => requested !== undefined);
    stage = requested as DealStage;
    requested = undefined;

    await writeAuditEvent({
      accountId,
      dealId,
      actorUserId,
      eventType: `stage_entered:${stage}`,
      payload: { stage },
    });

    if (stage !== 'closed') {
      await startStageChild(stage, input);
    }
  }
}
