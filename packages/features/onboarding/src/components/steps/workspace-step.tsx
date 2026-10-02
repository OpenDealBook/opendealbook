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
    defaultValues: {
      kind: props.value?.kind ?? 'personal',
      teamName: props.value?.kind === 'team' ? props.value.teamName : '',
    },
  });

  const kind = form.watch('kind');

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
          name="kind"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Workspace</FormLabel>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={field.value === 'personal' ? 'default' : 'outline'}
                  onClick={() => field.onChange('personal')}
                >
                  Just me
                </Button>
                <Button
                  type="button"
                  variant={field.value === 'team' ? 'default' : 'outline'}
                  onClick={() => field.onChange('team')}
                >
                  A team
                </Button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {kind === 'team' ? (
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
        ) : null}

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
