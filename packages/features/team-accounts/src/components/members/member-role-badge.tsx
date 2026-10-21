import { Badge } from '@odb/ui/badge';

import { ROLE_LABELS } from '../../role-labels';

export function MemberRoleBadge(props: { role: string }) {
  return <Badge variant="secondary">{ROLE_LABELS[props.role]}</Badge>;
}
