import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { TemplateField } from '@odb/ui/template-field';

const meta: Meta<typeof TemplateField> = {
  title: 'Custom/TemplateField',
  component: TemplateField,
  args: {
    label: 'Enterprise value',
    type: 'currency',
    value: '12450000',
    source: 'Term sheet, p.2',
    onChange: fn(),
  },
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'currency', 'date', 'percent', 'list'],
    },
  },
};

export default meta;

type Story = StoryObj<typeof TemplateField>;

export const Currency: Story = {};

export const Percent: Story = {
  args: {
    label: 'Equity stake',
    type: 'percent',
    value: '18.5',
    source: 'Cap table',
  },
};

export const Date_: Story = {
  args: {
    label: 'Closing date',
    type: 'date',
    value: '2026-12-15',
    source: 'SPA §3.1',
  },
};

export const List: Story = {
  args: {
    label: 'Key personnel',
    type: 'list',
    value: 'Founder, CFO, VP Eng',
    source: 'Org chart',
  },
};
