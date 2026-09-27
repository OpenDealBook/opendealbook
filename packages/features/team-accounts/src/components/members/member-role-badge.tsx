import { Badge } from '@tuckin/ui/badge';

export function MemberRoleBadge(props: { role: string }) {
  return <Badge variant="secondary">{props.role}</Badge>;
}
