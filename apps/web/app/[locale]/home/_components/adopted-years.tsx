'use client';

import type { AdoptedYear } from '@odb/deals/schema';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import { money, ratio } from './calc-shared';

export function AdoptedYears(props: { years: AdoptedYear[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead />
          {props.years.map((year) => (
            <TableHead key={year.year}>Yr {year.year}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Debt service</TableCell>
          {props.years.map((year) => (
            <TableCell key={year.year}>{money(year.debt_service)}</TableCell>
          ))}
        </TableRow>
        <TableRow>
          <TableCell>DSCR</TableCell>
          {props.years.map((year) => (
            <TableCell key={year.year}>{ratio(year.dscr)}</TableCell>
          ))}
        </TableRow>
        <TableRow>
          <TableCell>Net cash flow</TableCell>
          {props.years.map((year) => (
            <TableCell key={year.year}>{money(year.net_cash_flow)}</TableCell>
          ))}
        </TableRow>
      </TableBody>
    </Table>
  );
}
