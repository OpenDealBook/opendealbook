'use client';

import { useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';

import { Button } from '@odb/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@odb/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@odb/ui/dropdown-menu';
import { Input } from '@odb/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import { nameMatchesConfirmation } from '../lib/confirm';
import { deleteAccountAction } from '../lib/server/admin-actions';
import { useAdminAccounts } from '../hooks/use-admin-accounts';

type AccountRow = {
  id: string;
  name: string;
  email: string | null;
  created_at: string | null;
};

const PER_PAGE = 20;

export function AdminAccountsTable({
  onSelectAccount,
}: {
  onSelectAccount?: (accountId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<AccountRow | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const queryClient = useQueryClient();

  const { data, isPending } = useAdminAccounts({
    search: search || undefined,
    page,
    perPage: PER_PAGE,
  });

  const columns: ColumnDef<AccountRow>[] = [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'email', header: 'Email' },
    {
      accessorKey: 'created_at',
      header: 'Created',
      cell: ({ row }) => row.original.created_at?.slice(0, 10),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => onSelectAccount?.(row.original.id)}
            >
              View
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setConfirmName('');
                setDeleteTarget(row.original);
              }}
            >
              Delete account
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const table = useReactTable<AccountRow>({
    data: data?.accounts ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const confirmed =
    deleteTarget !== null &&
    nameMatchesConfirmation(confirmName, deleteTarget.name);

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search accounts"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(0);
        }}
      />

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
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

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0 || isPending}
          onClick={() => setPage((current) => current - 1)}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending || !data || (page + 1) * PER_PAGE >= data.count}
          onClick={() => setPage((current) => current + 1)}
        >
          Next
        </Button>
      </div>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete account</DialogTitle>
            <DialogDescription>
              This permanently deletes {deleteTarget?.name} and everything it
              owns. Type the account name to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirmName}
            placeholder={deleteTarget?.name}
            onChange={(event) => setConfirmName(event.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!confirmed}
              onClick={async () => {
                if (!deleteTarget) {
                  return;
                }

                await deleteAccountAction({ accountId: deleteTarget.id });
                setDeleteTarget(null);
                await queryClient.invalidateQueries({
                  queryKey: ['admin', 'accounts'],
                });
              }}
            >
              Delete account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
