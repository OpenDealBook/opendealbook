import { describe, expect, it } from 'vitest';

import { canManageMember, outranks, type Role } from './roles';

const owner: Role = { name: 'owner', hierarchyLevel: 0 };
const admin: Role = { name: 'admin', hierarchyLevel: 1 };
const peerAdmin: Role = { name: 'admin', hierarchyLevel: 1 };

describe('outranks', () => {
  it('is true when the actor has a lower hierarchy level', () => {
    expect(outranks(owner, admin)).toBe(true);
  });

  it('is false when the actor has a higher hierarchy level', () => {
    expect(outranks(admin, owner)).toBe(false);
  });

  it('is false at equal hierarchy level', () => {
    expect(outranks(admin, peerAdmin)).toBe(false);
  });
});

describe('canManageMember', () => {
  it('allows when the actor holds members.manage and outranks the target', () => {
    expect(canManageMember(owner, admin, ['members.manage'])).toBe(true);
  });

  it('denies when members.manage is missing even if the actor outranks', () => {
    expect(canManageMember(owner, admin, ['roles.manage'])).toBe(false);
  });

  it('denies when the actor holds members.manage but does not outrank the target', () => {
    expect(canManageMember(admin, peerAdmin, ['members.manage'])).toBe(false);
  });
});
