'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { Button } from '@tuckin/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuckin/ui/form';
import { Input } from '@tuckin/ui/input';

import { slugify } from '../lib/slugify';
import {
  createTeamSchema,
  type CreateTeamData,
} from '../schema/create-team.schema';
import { createTeamAccountAction } from '../server/create-team-action';

export function CreateTeamForm(props: { onSuccess?: (slug: string) => void }) {
  const form = useForm<CreateTeamData>({
    resolver: zodResolver(createTeamSchema),
    defaultValues: { name: '', slug: '' },
  });

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(async (values) => {
          await createTeamAccountAction(values);
          props.onSuccess?.(values.slug);
        })}
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Team name</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  onChange={(event) => {
                    field.onChange(event);
                    form.setValue('slug', slugify(event.target.value), {
                      shouldValidate: true,
                    });
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Slug</FormLabel>
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
