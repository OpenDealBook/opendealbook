import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { DealSwitcher } from '@odb/ui/deal-switcher';

const meta: Meta<typeof DealSwitcher> = {
  title: 'Custom/DealSwitcher',
  component: DealSwitcher,
  args: {
    activeDealId: 'd1',
    onSelect: fn(),
    onAllDeals: fn(),
    deals: [
      { id: 'd1', name: 'Acme Corp', stage: 'Diligence', daysInStage: 12 },
      { id: 'd2', name: 'Northwind', stage: 'IC review', daysInStage: 4 },
      { id: 'd3', name: 'Globex', stage: 'Closing', daysInStage: 21 },
    ],
  },
};

export default meta;

type Story = StoryObj<typeof DealSwitcher>;

export const Default: Story = {};
