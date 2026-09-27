'use client';

import { useMemo } from 'react';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';

import {
  canManageMember,
  type AppPermission,
  type Role,
} from '@tuckin/policies';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuckin/ui/table';

import type { TeamMember } from '../../lib/types';
import { MemberRoleBadge } from './member-role-badge';
import { RemoveMemberDialog } from './remove-member-dialog';
import { TransferOwnershipDialog } from './transfer-ownership-dialog';
import { UpdateMemberRoleDialog } from './update-member-role-dialog';

export function MembersTable(props: {
  accountId: string;
  members: TeamMember[];
  actorRole: Role;
  permissions: AppPermission[];
  roles: Role[];
  isOwner: boolean;
  onChange?: () => void;
}) {
  const columns = useMemo<ColumnDef<TeamMember>[]>(
    () => [
      {
        header: 'Member',
        accessorKey: 'userId',
      },
      {
        header: 'Role',
        cell: ({ row }) => <MemberRoleBadge role={row.original.role} />,
      },
      {
        header: 'Actions',
        cell: ({ row }) => {
          const member = row.original;
          const targetRole: Role = {
            name: member.role,
            hierarchyLevel: member.roleHierarchyLevel,
          };
          const manageable = canManageMember(
            props.actorRole,
            targetRole,
            props.permissions,
          );

          return (
            <div className="flex gap-2">
              {manageable ? (
                <UpdateMemberRoleDialog
                  accountId={props.accountId}
                  userId={member.userId}
                  currentRole={member.role}
                  roles={props.roles}
                  onSuccess={props.onChange}
                />
              ) : null}
              {manageable ? (
                <RemoveMemberDialog
                  accountId={props.accountId}
                  userId={member.userId}
                  onSuccess={props.onChange}
                />
              ) : null}
              {props.isOwner ? (
                <TransferOwnershipDialog
                  accountId={props.accountId}
                  userId={member.userId}
                  onSuccess={props.onChange}
                />
              ) : null}
            </div>
          );
        },
      },
    ],
    [
      props.accountId,
      props.actorRole,
      props.permissions,
      props.roles,
      props.isOwner,
      props.onChange,
    ],
  );

  const table = useReactTable({
    data: props.members,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
                {flexRender(
                  header.column.columnDef.header,
                  header.getContext(),
                )}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
