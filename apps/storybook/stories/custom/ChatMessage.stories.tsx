import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@odb/ui/ai-elements/conversation';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@odb/ui/ai-elements/message';

const meta: Meta<typeof Conversation> = {
  title: 'AI/Conversation',
  component: Conversation,
};

export default meta;

type Story = StoryObj<typeof Conversation>;

export const Default: Story = {
  render: () => (
    <Conversation style={{ maxWidth: 560, height: 320 }}>
      <ConversationContent>
        <Message from="user">
          <MessageContent>
            What is the client concentration in the 2024 book?
          </MessageContent>
        </Message>
        <Message from="assistant">
          <MessageContent>
            <MessageResponse>
              {
                'The top client accounts for **34%** of billings, which is above the 25% diligence threshold.'
              }
            </MessageResponse>
          </MessageContent>
        </Message>
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  ),
};
