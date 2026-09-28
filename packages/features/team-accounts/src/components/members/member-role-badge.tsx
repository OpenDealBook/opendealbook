import { Badge } from '@odb/ui/badge';

export function MemberRoleBadge(props: { role: string }) {
  return <Badge variant="secondary">{props.role}</Badge>;
}
