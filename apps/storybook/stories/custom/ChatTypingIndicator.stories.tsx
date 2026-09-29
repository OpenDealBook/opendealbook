import type { Meta, StoryObj } from '@storybook/react-vite';

import { ChatTypingIndicator } from '@odb/ui/chat-typing-indicator';

const meta: Meta<typeof ChatTypingIndicator> = {
  title: 'AI/ChatTypingIndicator',
  component: ChatTypingIndicator,
};

export default meta;

type Story = StoryObj<typeof ChatTypingIndicator>;

export const Default: Story = {};
