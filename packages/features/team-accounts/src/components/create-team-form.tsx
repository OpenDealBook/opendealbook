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
  createTeamSchema,
  type CreateTeamData,
} from '../schema/create-team.schema';
import { createTeamAccountAction } from '../server/create-team-action';

export function CreateTeamForm(props: { onSuccess?: (slug: string) => void }) {
  const form = useForm<CreateTeamData>({
    resolver: zodResolver(createTeamSchema),
    defaultValues: { name: '' },
  });

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(async (values) => {
          const account = await createTeamAccountAction(values);
          props.onSuccess?.(account.slug!);
        })}
      >
        <FormField
          control={form.control}
          name="name"
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

        <Button type="submit" disabled={form.formState.isSubmitting}>
          Create team
        </Button>
      </form>
    </Form>
  );
}
