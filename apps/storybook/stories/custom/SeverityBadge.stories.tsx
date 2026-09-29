import type { Meta, StoryObj } from '@storybook/react-vite';

import { SeverityBadge } from '@odb/ui/severity-badge';

const meta: Meta<typeof SeverityBadge> = {
  title: 'AI/SeverityBadge',
  component: SeverityBadge,
  args: { severity: 'warning', children: 'Missing signature' },
};

export default meta;

type Story = StoryObj<typeof SeverityBadge>;

export const Default: Story = {};

export const Severities: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <SeverityBadge severity="info">Informational</SeverityBadge>
      <SeverityBadge severity="warning">Needs review</SeverityBadge>
      <SeverityBadge severity="error">Verification failed</SeverityBadge>
    </div>
  ),
};
