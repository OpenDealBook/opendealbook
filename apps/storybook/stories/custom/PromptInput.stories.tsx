import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '@odb/ui/button';
import {
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
} from '@odb/ui/prompt-input';

const meta: Meta<typeof PromptInput> = {
  title: 'AI/PromptInput',
  component: PromptInput,
};

export default meta;

type Story = StoryObj<typeof PromptInput>;

export const Composer: Story = {
  render: () => {
    const Demo = () => {
      const [value, setValue] = useState('');
      return (
        <div style={{ maxWidth: 560 }}>
          <PromptInput
            value={value}
            onValueChange={setValue}
            onSubmit={() => setValue('')}
          >
            <PromptInputTextarea placeholder="Ask about this deal room..." />
            <PromptInputActions className="justify-end pt-2">
              <Button className="rounded-full">Send</Button>
            </PromptInputActions>
          </PromptInput>
        </div>
      );
    };
    return <Demo />;
  },
};
