'use client';

import { useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';

import { Button } from '@tuckin/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuckin/ui/dropdown-menu';
import { Input } from '@tuckin/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuckin/ui/table';

import { useAdminAccounts } from '../hooks/use-admin-accounts';
import { deleteAccountAction } from '../lib/server/admin-actions';

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
              onSelect={async () => {
                await deleteAccountAction({ accountId: row.original.id });
                await queryClient.invalidateQueries({
                  queryKey: ['admin', 'accounts'],
                });
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
    </div>
  );
}
