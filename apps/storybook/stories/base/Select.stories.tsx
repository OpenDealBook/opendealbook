import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';

const meta: Meta<typeof Select> = {
  title: 'Base/Select',
  component: Select,
};

export default meta;

type Story = StoryObj<typeof Select>;

export const Default: Story = {
  render: () => (
    <Select onValueChange={fn()}>
      <SelectTrigger style={{ width: 240 }}>
        <SelectValue placeholder="Select a stage" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Pipeline</SelectLabel>
          <SelectItem value="sourced">Sourced</SelectItem>
          <SelectItem value="diligence">Diligence</SelectItem>
          <SelectItem value="ic">IC review</SelectItem>
          <SelectItem value="closing">Closing</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
};
