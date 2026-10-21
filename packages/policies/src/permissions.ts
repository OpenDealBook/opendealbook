import { z } from 'zod';

import { Constants } from '@odb/supabase';

export const appPermissionSchema = z.enum(
  Constants.public.Enums.app_permissions,
);

export type AppPermission = z.infer<typeof appPermissionSchema>;

export function hasPermission(
  granted: AppPermission[],
  required: AppPermission,
): boolean {
  return granted.includes(required);
}
