import type { Meta, StoryObj } from '@storybook/react-vite';

import { Badge } from '@odb/ui/badge';

const meta: Meta<typeof Badge> = {
  title: 'Base/Badge',
  component: Badge,
  args: { children: 'Active' },
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'secondary', 'destructive', 'outline'],
    },
  },
};

export default meta;

type Story = StoryObj<typeof Badge>;

export const Default: Story = {};

export const Variants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="outline">Outline</Badge>
      <Badge variant="destructive">At risk</Badge>
    </div>
  ),
};
