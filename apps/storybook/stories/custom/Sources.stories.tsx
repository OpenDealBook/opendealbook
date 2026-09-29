import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@odb/ui/sources';

const meta: Meta<typeof Sources> = {
  title: 'AI/Sources',
  component: Sources,
};

export default meta;

type Story = StoryObj<typeof Sources>;

export const Citations: Story = {
  render: () => (
    <Sources open style={{ maxWidth: 480 }}>
      <SourcesTrigger count={2} />
      <SourcesContent>
        <Source href="#" title="CIM.pdf, page 12" />
        <Source href="#" title="Form 1120 (2024), Schedule C" />
      </SourcesContent>
    </Sources>
  ),
};
