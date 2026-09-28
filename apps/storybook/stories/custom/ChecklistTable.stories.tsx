import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { ChecklistTable } from '@odb/ui/checklist-table';

const meta: Meta<typeof ChecklistTable> = {
  title: 'Custom/ChecklistTable',
  component: ChecklistTable,
  args: {
    onStatusChange: fn(),
    items: [
      {
        id: 'c1',
        title: 'Signed NDA',
        category: 'Legal',
        status: 'received',
        dueAt: '2026-10-01',
        owner: 'J. Rivera',
      },
      {
        id: 'c2',
        title: 'Cap table',
        category: 'Finance',
        status: 'requested',
        dueAt: '2026-10-04',
        owner: 'P. Osei',
      },
      {
        id: 'c3',
        title: 'Audited financials',
        category: 'Finance',
        status: 'not_started',
        dueAt: '2026-10-10',
        owner: 'M. Tan',
      },
      {
        id: 'c4',
        title: 'Customer references',
        category: 'Commercial',
        status: 'reviewed',
        dueAt: '2026-09-28',
        owner: 'J. Rivera',
      },
    ],
  },
};

export default meta;

type Story = StoryObj<typeof ChecklistTable>;

export const Default: Story = {};
