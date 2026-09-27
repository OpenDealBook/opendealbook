import { describe, expect, it } from 'vitest';

import { createTeamSchema } from './create-team.schema';
import { inviteMembersSchema } from './invite-members.schema';

describe('createTeamSchema', () => {
  it('accepts a lowercase hyphenated slug', () => {
    const result = createTeamSchema.safeParse({
      name: 'Acme Inc',
      slug: 'acme-inc',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a slug with uppercase or spaces', () => {
    const result = createTeamSchema.safeParse({
      name: 'Acme Inc',
      slug: 'Acme Inc',
    });

    expect(result.success).toBe(false);
  });
});

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
        { email: 'b@example.com', role: 'owner' },
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
