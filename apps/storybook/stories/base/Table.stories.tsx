import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

const meta: Meta<typeof Table> = {
  title: 'Base/Table',
  component: Table,
};

export default meta;

type Story = StoryObj<typeof Table>;

const rows = [
  {
    deal: 'Acme Corp',
    stage: 'Diligence',
    owner: 'J. Rivera',
    check: '8 / 12',
  },
  { deal: 'Northwind', stage: 'IC review', owner: 'P. Osei', check: '11 / 12' },
  { deal: 'Globex', stage: 'Closing', owner: 'M. Tan', check: '12 / 12' },
];

export const Default: Story = {
  render: () => (
    <Table>
      <TableCaption>Active deals this quarter.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Deal</TableHead>
          <TableHead>Stage</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead style={{ textAlign: 'right' }}>Checklist</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.deal}>
            <TableCell style={{ fontWeight: 500 }}>{row.deal}</TableCell>
            <TableCell>{row.stage}</TableCell>
            <TableCell>{row.owner}</TableCell>
            <TableCell style={{ textAlign: 'right' }}>{row.check}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
};
