import { describe, expect, it } from 'vitest';

import { canManageMember, type Role } from '@odb/policies';

describe('member management gating', () => {
  const actor: Role = { name: 'owner', hierarchyLevel: 1 };
  const target: Role = { name: 'member', hierarchyLevel: 3 };

  it('denies a member lacking members.manage even when outranking', () => {
    expect(canManageMember(actor, target, [])).toBe(false);
  });

  it('allows a member with members.manage that outranks the target', () => {
    expect(canManageMember(actor, target, ['members.manage'])).toBe(true);
  });
});
