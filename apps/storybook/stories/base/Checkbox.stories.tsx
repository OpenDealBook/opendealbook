import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { Checkbox } from '@tuckin/ui/checkbox';
import { Label } from '@tuckin/ui/label';

const meta: Meta<typeof Checkbox> = {
  title: 'Base/Checkbox',
  component: Checkbox,
  args: { onCheckedChange: fn() },
};

export default meta;

type Story = StoryObj<typeof Checkbox>;

export const Default: Story = {
  render: (args) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Checkbox id="nda" {...args} />
      <Label htmlFor="nda">NDA countersigned</Label>
    </div>
  ),
};

export const Checked: Story = {
  render: (args) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Checkbox id="nda-checked" defaultChecked {...args} />
      <Label htmlFor="nda-checked">NDA countersigned</Label>
    </div>
  ),
};

export const Disabled: Story = {
  render: (args) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Checkbox id="nda-disabled" disabled {...args} />
      <Label htmlFor="nda-disabled">Locked requirement</Label>
    </div>
  ),
};
