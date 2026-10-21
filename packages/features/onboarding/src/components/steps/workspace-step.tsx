'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { Button } from '@odb/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@odb/ui/form';
import { Input } from '@odb/ui/input';

import {
  workspaceStepSchema,
  type WorkspaceStep,
} from '../../schema/onboarding.schema';

export function WorkspaceStepForm(props: {
  value?: WorkspaceStep;
  onSubmit: (value: WorkspaceStep) => void;
  onBack?: () => void;
}) {
  const form = useForm({
    resolver: zodResolver(workspaceStepSchema),
    defaultValues: { teamName: props.value?.teamName ?? '' },
  });

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) =>
          props.onSubmit(workspaceStepSchema.parse(values)),
        )}
      >
        <FormField
          control={form.control}
          name="teamName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Team name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2">
          {props.onBack ? (
            <Button type="button" variant="ghost" onClick={props.onBack}>
              Back
            </Button>
          ) : null}
          <Button type="submit">Continue</Button>
        </div>
      </form>
    </Form>
  );
}
