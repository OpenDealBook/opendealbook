import { z } from 'zod';

import {
  participantPartySchema,
  participantPermissionSchema,
  participantScopeSchema,
} from './enums';

export const dealParticipantSchema = z.object({
  deal_id: z.uuid(),
  user_id: z.uuid(),
  party: participantPartySchema,
  role: z.string().optional(),
  scope: participantScopeSchema.default('deal'),
  scope_id: z.uuid().optional(),
  permission: participantPermissionSchema.default('view'),
  expires_at: z.string().optional(),
});

export type DealParticipantPayload = z.infer<typeof dealParticipantSchema>;
