import type { Meta, StoryObj } from '@storybook/react-vite';

import { Spinner } from '@odb/ui/spinner';

const meta: Meta<typeof Spinner> = {
  title: 'Base/Spinner',
  component: Spinner,
};

export default meta;

type Story = StoryObj<typeof Spinner>;

export const Default: Story = {};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <Spinner className="size-4" />
      <Spinner className="size-6" />
      <Spinner className="size-8" />
    </div>
  ),
};
