import type { Meta, StoryObj } from '@storybook/react-vite';

import { Input } from '@tuckin/ui/input';

const meta: Meta<typeof Input> = {
  title: 'Base/Input',
  component: Input,
  args: { placeholder: 'jane@fund.com' },
};

export default meta;

type Story = StoryObj<typeof Input>;

export const Default: Story = {};

export const Email: Story = { args: { type: 'email' } };

export const Disabled: Story = {
  args: { disabled: true, value: 'locked value' },
};

export const Invalid: Story = {
  args: { 'aria-invalid': true, defaultValue: 'not-an-email' },
};
