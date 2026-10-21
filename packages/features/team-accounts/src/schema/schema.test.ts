import { describe, expect, it } from 'vitest';

import { inviteMembersSchema } from './invite-members.schema';
import { updateMemberRoleSchema } from './update-member-role.schema';

describe('inviteMembersSchema', () => {
  it('rejects duplicate emails ignoring case', () => {
    const result = inviteMembersSchema.safeParse({
      slug: 'acme',
      invitations: [
        { email: 'a@example.com', role: 'member' },
        { email: 'A@example.com', role: 'member' },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('accepts a set of unique invitations', () => {
    const result = inviteMembersSchema.safeParse({
      slug: 'acme',
      invitations: [
        { email: 'a@example.com', role: 'member' },
        { email: 'b@example.com', role: 'admin' },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('rejects an empty invitations list', () => {
    const result = inviteMembersSchema.safeParse({
      slug: 'acme',
      invitations: [],
    });

    expect(result.success).toBe(false);
  });
});

const notInvitable = [
  'owner',
  'analyst',
  'external_counsel',
  'seller',
  'broker',
];

describe('roles a team can grant', () => {
  it.each(notInvitable)('refuses to invite as %s', (role) => {
    const result = inviteMembersSchema.safeParse({
      slug: 'acme',
      invitations: [{ email: 'a@example.com', role }],
    });

    expect(result.success).toBe(false);
  });

  it.each(notInvitable)('refuses to change a member to %s', (role) => {
    const result = updateMemberRoleSchema.safeParse({
      accountId: '6f1c2b7e-0a4d-4c55-9a43-2f5e8d1b9c10',
      userId: '0b3e7a52-1c9d-4f2e-8a61-5d4c3b2a1f00',
      role,
    });

    expect(result.success).toBe(false);
  });

  it.each(['admin', 'deal_lead', 'member', 'counsel', 'viewer'])(
    'accepts %s for an invite and a role change',
    (role) => {
      expect(
        inviteMembersSchema.safeParse({
          slug: 'acme',
          invitations: [{ email: 'a@example.com', role }],
        }).success,
      ).toBe(true);
      expect(
        updateMemberRoleSchema.safeParse({
          accountId: '6f1c2b7e-0a4d-4c55-9a43-2f5e8d1b9c10',
          userId: '0b3e7a52-1c9d-4f2e-8a61-5d4c3b2a1f00',
          role,
        }).success,
      ).toBe(true);
    },
  );
});
