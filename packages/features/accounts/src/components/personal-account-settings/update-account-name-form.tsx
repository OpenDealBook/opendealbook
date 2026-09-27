'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';

import { Alert, AlertDescription, AlertTitle } from '@tuckin/ui/alert';
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

import { useRevalidatePersonalAccountData } from '../../hooks/use-revalidate-personal-account-data';
import {
  UpdateAccountNameSchema,
  type UpdateAccountNamePayload,
} from '../../schema/update-account-name.schema';
import { updatePersonalAccountNameAction } from '../../server/personal-account-actions';

export function UpdateAccountNameForm({
  userId,
  displayName,
}: {
  userId: string;
  displayName: string;
}) {
  const revalidate = useRevalidatePersonalAccountData();

  const form = useForm<UpdateAccountNamePayload>({
    resolver: zodResolver(UpdateAccountNameSchema),
    defaultValues: { name: displayName },
  });

  const mutation = useMutation({
    mutationFn: (values: UpdateAccountNamePayload) =>
      updatePersonalAccountNameAction(values),
    onSuccess: () => revalidate(userId),
  });

  return (
    <Form {...form}>
      <form
        className="flex flex-col space-y-4"
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      >
        {mutation.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Update failed</AlertTitle>
            <AlertDescription>Your name could not be updated.</AlertDescription>
          </Alert>
        ) : null}

        <FormField
          name="name"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input maxLength={100} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div>
          <Button type="submit" disabled={mutation.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Form>
  );
}
