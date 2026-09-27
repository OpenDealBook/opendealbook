import { z } from 'zod';

export const appPermissionSchema = z.enum([
  'roles.manage',
  'billing.manage',
  'settings.manage',
  'members.manage',
  'invites.manage',
  'deals.create',
  'deals.manage',
  'checklists.manage',
  'participants.manage',
]);

export type AppPermission = z.infer<typeof appPermissionSchema>;

export function hasPermission(
  granted: AppPermission[],
  required: AppPermission,
): boolean {
  return granted.includes(required);
}
