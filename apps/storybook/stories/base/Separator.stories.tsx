import type { Meta, StoryObj } from '@storybook/react-vite';

import { Separator } from '@odb/ui/separator';

const meta: Meta<typeof Separator> = {
  title: 'Base/Separator',
  component: Separator,
};

export default meta;

type Story = StoryObj<typeof Separator>;

export const Horizontal: Story = {
  render: () => (
    <div style={{ width: 320 }}>
      <div style={{ fontSize: 14, fontWeight: 500 }}>Deal terms</div>
      <Separator style={{ margin: '12px 0' }} />
      <div style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>
        Diligence
      </div>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div style={{ display: 'flex', height: 24, alignItems: 'center', gap: 12 }}>
      <span style={{ fontSize: 14 }}>Overview</span>
      <Separator orientation="vertical" />
      <span style={{ fontSize: 14 }}>Documents</span>
      <Separator orientation="vertical" />
      <span style={{ fontSize: 14 }}>Activity</span>
    </div>
  ),
};
