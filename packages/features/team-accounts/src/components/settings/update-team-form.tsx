'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { hasPermission, type AppPermission } from '@tuckin/policies';
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

import {
  updateTeamSchema,
  type UpdateTeamData,
} from '../../schema/update-team.schema';
import { updateTeamAction } from '../../server/settings-actions';

export function UpdateTeamForm(props: {
  accountId: string;
  name: string;
  slug: string;
  permissions: AppPermission[];
  onSuccess?: () => void;
}) {
  const form = useForm<UpdateTeamData>({
    resolver: zodResolver(updateTeamSchema),
    defaultValues: {
      accountId: props.accountId,
      name: props.name,
      slug: props.slug,
    },
  });

  if (!hasPermission(props.permissions, 'settings.manage')) {
    return null;
  }

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(async (values) => {
          await updateTeamAction(values);
          props.onSuccess?.();
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
          Save changes
        </Button>
      </form>
    </Form>
  );
}
