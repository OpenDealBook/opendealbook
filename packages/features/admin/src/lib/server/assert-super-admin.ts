import type { User } from '@supabase/supabase-js';

const SUPER_ADMIN_ROLE = 'super-admin';

export function assertSuperAdmin(user: User): User {
  if (user.app_metadata.role !== SUPER_ADMIN_ROLE) {
    throw new Error('Super admin access required');
  }

  return user;
}
