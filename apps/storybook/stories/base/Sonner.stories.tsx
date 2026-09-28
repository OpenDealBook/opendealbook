import type { Meta, StoryObj } from '@storybook/react-vite';
import { toast } from 'sonner';

import { Button } from '@odb/ui/button';
import { Toaster } from '@odb/ui/sonner';

const meta: Meta<typeof Toaster> = {
  title: 'Base/Sonner',
  component: Toaster,
};

export default meta;

type Story = StoryObj<typeof Toaster>;

export const Default: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12 }}>
      <Toaster />
      <Button
        onClick={() =>
          toast('Deal saved', { description: 'Acme Corp moved to Diligence.' })
        }
      >
        Show toast
      </Button>
      <Button
        variant="outline"
        onClick={() => toast.success('Checklist item marked received')}
      >
        Show success
      </Button>
    </div>
  ),
};
