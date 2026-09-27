import { hasPermission, type AppPermission } from './permissions';

export type Role = {
  name: string;
  hierarchyLevel: number;
};

export function outranks(actor: Role, target: Role): boolean {
  return actor.hierarchyLevel < target.hierarchyLevel;
}

export function canManageMember(
  actor: Role,
  target: Role,
  granted: AppPermission[],
): boolean {
  return hasPermission(granted, 'members.manage') && outranks(actor, target);
}
