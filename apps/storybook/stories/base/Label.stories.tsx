import type { Meta, StoryObj } from '@storybook/react-vite';

import { Input } from '@tuckin/ui/input';
import { Label } from '@tuckin/ui/label';

const meta: Meta<typeof Label> = {
  title: 'Base/Label',
  component: Label,
  args: { children: 'Deal name' },
};

export default meta;

type Story = StoryObj<typeof Label>;

export const Default: Story = {};

export const WithField: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 6, width: 280 }}>
      <Label htmlFor="deal-name">Deal name</Label>
      <Input id="deal-name" placeholder="Acme Corp" />
    </div>
  ),
};
