import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { Button } from '@tuckin/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@tuckin/ui/sheet';

const meta: Meta<typeof Sheet> = {
  title: 'Base/Sheet',
  component: Sheet,
};

export default meta;

type Story = StoryObj<typeof Sheet>;

export const Default: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Deal details</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Acme Corp</SheetTitle>
          <SheetDescription>Series B secondary, closing Q4.</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <Button onClick={fn()}>Save</Button>
          <SheetClose asChild>
            <Button variant="outline">Close</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};
