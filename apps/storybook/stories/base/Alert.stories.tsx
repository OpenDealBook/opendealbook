import type { Meta, StoryObj } from '@storybook/react-vite';

import { Alert, AlertDescription, AlertTitle } from '@odb/ui/alert';

const meta: Meta<typeof Alert> = {
  title: 'Base/Alert',
  component: Alert,
  argTypes: {
    variant: { control: 'select', options: ['default', 'destructive'] },
  },
};

export default meta;

type Story = StoryObj<typeof Alert>;

export const Default: Story = {
  render: () => (
    <Alert style={{ maxWidth: 480 }}>
      <AlertTitle>Diligence updated</AlertTitle>
      <AlertDescription>
        Two new documents were added to the data room.
      </AlertDescription>
    </Alert>
  ),
};

export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive" style={{ maxWidth: 480 }}>
      <AlertTitle>Closing at risk</AlertTitle>
      <AlertDescription>
        The signed term sheet is overdue by 3 days.
      </AlertDescription>
    </Alert>
  ),
};
