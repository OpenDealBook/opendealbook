import type { Meta, StoryObj } from '@storybook/react-vite';

import { FindingCard, FindingList } from '@odb/ui/finding-card';

const meta: Meta<typeof FindingCard> = {
  title: 'AI/FindingCard',
  component: FindingCard,
  args: {
    title: 'Revenue in CIM does not match tax returns',
    severity: 'error',
    severityLabel: 'Verification failed',
    description:
      'Reported 2024 revenue of $4.2M differs from Form 1120 gross receipts of $3.6M.',
  },
};

export default meta;

type Story = StoryObj<typeof FindingCard>;

export const Default: Story = {};

export const List: Story = {
  render: () => (
    <FindingList style={{ maxWidth: 520 }}>
      <FindingCard
        title="Client concentration above threshold"
        severity="warning"
        severityLabel="Needs review"
        description="Top client represents 34% of billings."
      />
      <FindingCard
        title="Engagement letters on file"
        severity="info"
        severityLabel="Verified"
        description="All sampled engagements have signed letters."
      />
    </FindingList>
  ),
};
