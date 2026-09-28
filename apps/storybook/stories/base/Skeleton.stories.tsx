import type { Meta, StoryObj } from '@storybook/react-vite';

import { Skeleton } from '@odb/ui/skeleton';

const meta: Meta<typeof Skeleton> = {
  title: 'Base/Skeleton',
  component: Skeleton,
};

export default meta;

type Story = StoryObj<typeof Skeleton>;

export const Card: Story = {
  render: () => (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 320 }}
    >
      <Skeleton style={{ height: 24, width: '60%' }} />
      <Skeleton style={{ height: 16, width: '100%' }} />
      <Skeleton style={{ height: 16, width: '80%' }} />
    </div>
  ),
};
