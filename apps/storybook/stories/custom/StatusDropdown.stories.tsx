import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { StatusDropdown } from '@odb/ui/status-dropdown';

const meta: Meta<typeof StatusDropdown> = {
  title: 'Custom/StatusDropdown',
  component: StatusDropdown,
  args: { value: 'requested', onChange: fn() },
  argTypes: {
    value: {
      control: 'select',
      options: ['not_started', 'requested', 'received', 'reviewed'],
    },
  },
};

export default meta;

type Story = StoryObj<typeof StatusDropdown>;

export const Default: Story = {};

export const Reviewed: Story = { args: { value: 'reviewed' } };
