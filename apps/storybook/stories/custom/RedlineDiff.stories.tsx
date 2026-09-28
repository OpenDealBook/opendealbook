import type { Meta, StoryObj } from '@storybook/react-vite';

import { RedlineDiff } from '@odb/ui/redline-diff';

const meta: Meta<typeof RedlineDiff> = {
  title: 'Custom/RedlineDiff',
  component: RedlineDiff,
  args: {
    segments: [
      {
        type: 'unchanged',
        text: 'The Seller shall deliver the shares within ',
      },
      { type: 'removed', text: 'thirty (30)' },
      { type: 'added', text: 'fifteen (15)' },
      {
        type: 'unchanged',
        text: ' business days of the Closing Date, subject to ',
      },
      { type: 'added', text: 'customary escrow conditions and ' },
      { type: 'unchanged', text: 'receipt of regulatory approval.' },
    ],
  },
};

export default meta;

type Story = StoryObj<typeof RedlineDiff>;

export const Default: Story = {};
