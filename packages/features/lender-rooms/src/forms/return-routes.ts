import type { Enums } from '@odb/supabase';

import { signableKind } from '../esign/eligibility';

export function allowedReturnRoutes(
  fileName: string,
): Enums<'lender_return_route'>[] {
  return signableKind(fileName) === null ? ['upload'] : ['upload', 'esign'];
}
