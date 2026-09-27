'use client';

import * as React from 'react';

import { StatusDropdown, type StatusValue } from '#components/status-dropdown';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/table';

type ChecklistItem = {
  id: string;
  title: string;
  category?: string;
  status: StatusValue;
  dueAt?: string;
  owner?: string;
};

function ChecklistTable({
  items,
  onStatusChange,
  empty,
}: {
  items: ChecklistItem[];
  onStatusChange?: (id: string, status: StatusValue) => void;
  empty?: React.ReactNode;
}) {
  return (
    <Table data-slot="checklist-table">
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Due</TableHead>
          <TableHead>Owner</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <TableRow data-slot="checklist-table-empty">
            <TableCell colSpan={5}>{empty}</TableCell>
          </TableRow>
        ) : (
          items.map((item) => (
            <TableRow key={item.id} data-status={item.status}>
              <TableCell>{item.title}</TableCell>
              <TableCell>{item.category}</TableCell>
              <TableCell>
                <StatusDropdown
                  value={item.status}
                  onChange={(status) => onStatusChange?.(item.id, status)}
                />
              </TableCell>
              <TableCell>{item.dueAt}</TableCell>
              <TableCell>{item.owner}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

export { ChecklistTable };
