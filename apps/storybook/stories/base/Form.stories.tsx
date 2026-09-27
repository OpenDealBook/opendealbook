import type { Meta, StoryObj } from '@storybook/react-vite';
import { useForm } from 'react-hook-form';
import { fn } from 'storybook/test';

import { Button } from '@tuckin/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuckin/ui/form';
import { Input } from '@tuckin/ui/input';

type DealForm = { name: string };

function DealNameForm({ onSubmit }: { onSubmit: (values: DealForm) => void }) {
  const form = useForm<DealForm>({ defaultValues: { name: '' } });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        style={{ width: 320, display: 'grid', gap: 16 }}
      >
        <FormField
          control={form.control}
          name="name"
          rules={{ required: 'A deal name is required' }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Deal name</FormLabel>
              <FormControl>
                <Input placeholder="Acme Corp" {...field} />
              </FormControl>
              <FormDescription>
                Shown across the pipeline and reports.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Create deal</Button>
      </form>
    </Form>
  );
}

const meta: Meta<typeof DealNameForm> = {
  title: 'Base/Form',
  component: DealNameForm,
  args: { onSubmit: fn() },
};

export default meta;

type Story = StoryObj<typeof DealNameForm>;

export const Default: Story = {};
