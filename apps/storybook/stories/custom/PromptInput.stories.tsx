import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@odb/ui/ai-elements/prompt-input';

const meta: Meta<typeof PromptInput> = {
  title: 'AI/PromptInput',
  component: PromptInput,
};

export default meta;

type Story = StoryObj<typeof PromptInput>;

export const Composer: Story = {
  render: () => (
    <div style={{ maxWidth: 560 }}>
      <PromptInput onSubmit={() => {}}>
        <PromptInputTextarea placeholder="Ask about this deal room..." />
        <PromptInputFooter className="justify-end">
          <PromptInputSubmit />
        </PromptInputFooter>
      </PromptInput>
    </div>
  ),
};

export const Submitted: Story = {
  render: () => (
    <div style={{ maxWidth: 560 }}>
      <PromptInput onSubmit={() => {}}>
        <PromptInputTextarea placeholder="Ask about this deal room..." />
        <PromptInputFooter className="justify-end">
          <PromptInputSubmit status="submitted" />
        </PromptInputFooter>
      </PromptInput>
    </div>
  ),
};
