import { z } from 'zod';

export const INVITABLE_ROLES = [
  'admin',
  'deal_lead',
  'member',
  'counsel',
  'viewer',
] as const;

export const invitableRoleSchema = z.enum(INVITABLE_ROLES);

const inviteSchema = z.object({
  email: z.string().trim().email(),
  role: invitableRoleSchema,
});

export const inviteMembersSchema = z
  .object({
    slug: z.string().trim().min(1),
    invitations: inviteSchema.array().min(1).max(10),
  })
  .refine(
    (data) => {
      const emails = data.invitations.map((invite) =>
        invite.email.toLowerCase(),
      );

      return emails.length === new Set(emails).size;
    },
    { message: 'Duplicate emails are not allowed', path: ['invitations'] },
  );

export type InviteMembersData = z.infer<typeof inviteMembersSchema>;
