import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '@tuckin/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuckin/ui/tooltip';

const meta: Meta<typeof Tooltip> = {
  title: 'Base/Tooltip',
  component: Tooltip,
};

export default meta;

type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
  render: () => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline">Hover me</Button>
        </TooltipTrigger>
        <TooltipContent>Last synced 4 minutes ago</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ),
};
