import { condition, setHandler, startChild } from '@temporalio/workflow';

import { announcementSchedule } from './announcementSchedule';
import { dataRoomProvisioning } from './dataRoomProvisioning';
import { loiNegotiation } from './loiNegotiation';
import { advanceStage, currentStage, type DealStage } from './signals';
import { weeklyMeetingCadence } from './weeklyMeetingCadence';

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
  let stage: DealStage = 'loi';
  let requested: DealStage | undefined;

  setHandler(advanceStage, (next) => {
    requested = next;
  });
  setHandler(currentStage, () => stage);

  await startStageChild(stage, input);

  while (stage !== 'closed') {
    await condition(() => requested !== undefined);
    stage = requested as DealStage;
    requested = undefined;

    if (stage !== 'closed') {
      await startStageChild(stage, input);
    }
  }
}
