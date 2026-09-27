import { describe, expect, it } from 'vitest';

import { appPermissionSchema, hasPermission } from './permissions';

describe('appPermissionSchema', () => {
  it('accepts each defined permission', () => {
    for (const permission of [
      'roles.manage',
      'billing.manage',
      'settings.manage',
      'members.manage',
      'invites.manage',
      'buyer_profile.manage',
    ]) {
      expect(appPermissionSchema.safeParse(permission).success).toBe(true);
    }
  });

  it('rejects an unknown permission', () => {
    expect(appPermissionSchema.safeParse('accounts.delete').success).toBe(
      false,
    );
  });
});

describe('hasPermission', () => {
  it('grants when the required permission is present', () => {
    expect(
      hasPermission(['billing.manage', 'members.manage'], 'members.manage'),
    ).toBe(true);
  });

  it('denies when the required permission is missing', () => {
    expect(hasPermission(['billing.manage'], 'members.manage')).toBe(false);
  });

  it('denies against an empty grant set', () => {
    expect(hasPermission([], 'roles.manage')).toBe(false);
  });
});
