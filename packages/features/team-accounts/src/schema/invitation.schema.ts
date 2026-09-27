import { z } from 'zod';

export const revokeInvitationSchema = z.object({
  invitationId: z.number().int().positive(),
});

export const resendInvitationSchema = z.object({
  invitationId: z.number().int().positive(),
});

export const acceptInvitationSchema = z.object({
  token: z.string().trim().min(1),
});

export type RevokeInvitationData = z.infer<typeof revokeInvitationSchema>;
export type ResendInvitationData = z.infer<typeof resendInvitationSchema>;
export type AcceptInvitationData = z.infer<typeof acceptInvitationSchema>;
