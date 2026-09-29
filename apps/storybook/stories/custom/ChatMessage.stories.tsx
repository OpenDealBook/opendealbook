import type { Meta, StoryObj } from '@storybook/react-vite';

import { Conversation, ConversationContent } from '@odb/ui/conversation';
import {
  Message,
  MessageAvatar,
  MessageContent,
} from '@odb/ui/chat-message';

const meta: Meta<typeof Message> = {
  title: 'AI/ChatMessage',
  component: Message,
};

export default meta;

type Story = StoryObj<typeof Message>;

export const Conversation_: Story = {
  name: 'Conversation',
  render: () => (
    <Conversation style={{ maxWidth: 560, height: 320 }}>
      <ConversationContent>
        <Message role="user">
          <MessageAvatar alt="You" fallback="ZC" />
          <MessageContent>
            What is the client concentration in the 2024 book?
          </MessageContent>
        </Message>
        <Message role="assistant">
          <MessageAvatar alt="Assistant" fallback="AI" />
          <MessageContent>
            The top client accounts for 34% of billings, which is above the 25%
            diligence threshold.
          </MessageContent>
        </Message>
      </ConversationContent>
    </Conversation>
  ),
};
