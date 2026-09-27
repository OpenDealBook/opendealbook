import { z } from 'zod';

const inviteSchema = z.object({
  email: z.string().trim().email(),
  role: z.string().trim().min(1).max(100),
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
