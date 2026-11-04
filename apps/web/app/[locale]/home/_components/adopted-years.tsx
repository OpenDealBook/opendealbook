'use client';

import type { AdoptedYear } from '@odb/deals/schema';
import { FigureValue } from '@odb/ui/figure-value';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

export function AdoptedYears(props: { years: AdoptedYear[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead />
          {props.years.map((year) => (
            <TableHead key={year.year} numeric>
              Yr {year.year}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Debt service</TableCell>
          {props.years.map((year) => (
            <TableCell key={year.year} numeric>
              <FigureValue
                calculated
                value={year.debt_service}
                format={'money'}
              />
            </TableCell>
          ))}
        </TableRow>
        <TableRow>
          <TableCell>DSCR</TableCell>
          {props.years.map((year) => (
            <TableCell key={year.year} numeric>
              <FigureValue calculated value={year.dscr} format={'ratio'} />
            </TableCell>
          ))}
        </TableRow>
        <TableRow>
          <TableCell>Net cash flow</TableCell>
          {props.years.map((year) => (
            <TableCell key={year.year} numeric>
              <FigureValue
                calculated
                value={year.net_cash_flow}
                format={'money'}
              />
            </TableCell>
          ))}
        </TableRow>
      </TableBody>
    </Table>
  );
}
