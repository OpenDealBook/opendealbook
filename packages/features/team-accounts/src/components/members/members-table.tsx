'use client';

import { useMemo } from 'react';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';

import { canManageMember, type AppPermission, type Role } from '@odb/policies';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import type { TeamMember } from '../../lib/types';
import { MemberRoleBadge } from './member-role-badge';
import { RemoveMemberDialog } from './remove-member-dialog';
import { TransferOwnershipDialog } from './transfer-ownership-dialog';
import { UpdateMemberRoleDialog } from './update-member-role-dialog';

type NamedMember = TeamMember & { name: string; email: string | null };

export function MembersTable(props: {
  accountId: string;
  members: NamedMember[];
  actorRole: Role;
  permissions: AppPermission[];
  isOwner: boolean;
  onChange?: () => void;
}) {
  const columns = useMemo<ColumnDef<NamedMember>[]>(
    () => [
      {
        header: 'Member',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.name}</span>
            <span className="text-muted-foreground text-sm">
              {row.original.email}
            </span>
          </div>
        ),
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
