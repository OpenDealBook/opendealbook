import { z } from 'zod';

// Keep in sync with the DB app_permissions enum (Enums<'app_permissions'> in @odb/supabase).
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
  'buyer_profile.manage',
]);

export type AppPermission = z.infer<typeof appPermissionSchema>;

export function hasPermission(
  granted: AppPermission[],
  required: AppPermission,
): boolean {
  return granted.includes(required);
}
