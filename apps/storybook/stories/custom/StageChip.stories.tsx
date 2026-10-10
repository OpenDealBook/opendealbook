import type { Meta, StoryObj } from '@storybook/react-vite';

import { StageChip } from '@odb/ui/stage-chip';

const meta: Meta<typeof StageChip> = {
  title: 'Custom/StageChip',
  component: StageChip,
  args: { stage: 'due_diligence' },
};

export default meta;

type Story = StoryObj<typeof StageChip>;

export const Default: Story = {};

export const Pipeline: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <StageChip stage="sourcing">Sourcing</StageChip>
      <StageChip stage="loi_accepted">LOI Accepted</StageChip>
      <StageChip stage="due_diligence">Due Diligence</StageChip>
      <StageChip stage="pa_accepted">PA Accepted</StageChip>
      <StageChip stage="integration">Integration</StageChip>
    </div>
  ),
};
