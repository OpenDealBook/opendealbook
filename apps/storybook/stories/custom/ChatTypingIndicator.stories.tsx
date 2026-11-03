import type { Meta, StoryObj } from '@storybook/react-vite';

import { Message, MessageContent } from '@odb/ui/ai-elements/message';
import { Spinner } from '@odb/ui/spinner';

const meta: Meta<typeof Message> = {
  title: 'AI/Thinking',
  component: Message,
};

export default meta;

type Story = StoryObj<typeof Message>;

export const Default: Story = {
  render: () => (
    <div style={{ maxWidth: 560 }}>
      <Message from="assistant">
        <MessageContent>
          <Spinner aria-label="Working on an answer" />
        </MessageContent>
      </Message>
    </div>
  ),
};
