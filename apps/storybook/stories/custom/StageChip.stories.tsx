import type { Meta, StoryObj } from '@storybook/react-vite';

import { StageChip } from '@tuckin/ui/stage-chip';

const meta: Meta<typeof StageChip> = {
  title: 'Custom/StageChip',
  component: StageChip,
  args: { stage: 'Diligence' },
};

export default meta;

type Story = StoryObj<typeof StageChip>;

export const Default: Story = {};

export const Stages: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <StageChip stage="Sourced" />
      <StageChip stage="Diligence" />
      <StageChip stage="IC review" />
      <StageChip stage="Closing" />
    </div>
  ),
};
