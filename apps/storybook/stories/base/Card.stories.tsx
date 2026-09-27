import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';

import { Button } from '@tuckin/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@tuckin/ui/card';

const meta: Meta<typeof Card> = {
  title: 'Base/Card',
  component: Card,
};

export default meta;

type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card style={{ width: 360 }}>
      <CardHeader>
        <CardTitle>Acme Corp acquisition</CardTitle>
        <CardDescription>Series B secondary, closing Q4</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" onClick={fn()}>
            Open
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>
          Diligence is 62% complete. Three checklist items remain outstanding.
        </p>
      </CardContent>
      <CardFooter>
        <Button onClick={fn()}>Continue</Button>
      </CardFooter>
    </Card>
  ),
};
