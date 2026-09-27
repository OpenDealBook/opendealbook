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

import {
  UpdateEmailSchema,
  type UpdateEmailPayload,
} from '../../schema/update-email.schema';
import { updateEmailAction } from '../../server/personal-account-actions';

export function UpdateEmailForm() {
  const form = useForm<UpdateEmailPayload>({
    resolver: zodResolver(UpdateEmailSchema),
    defaultValues: { email: '', repeatEmail: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: UpdateEmailPayload) => updateEmailAction(values),
    onSuccess: () => form.reset(),
  });

  return (
    <Form {...form}>
      <form
        className="flex flex-col space-y-4"
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      >
        {mutation.isSuccess ? (
          <Alert>
            <AlertTitle>Confirmation sent</AlertTitle>
            <AlertDescription>
              Check your inbox to confirm the new email address.
            </AlertDescription>
          </Alert>
        ) : null}

        {mutation.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Update failed</AlertTitle>
            <AlertDescription>
              Your email could not be updated.
            </AlertDescription>
          </Alert>
        ) : null}

        <FormField
          name="email"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>New email</FormLabel>
              <FormControl>
                <Input type="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          name="repeatEmail"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Repeat email</FormLabel>
              <FormControl>
                <Input type="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div>
          <Button type="submit" disabled={mutation.isPending}>
            Update email
          </Button>
        </div>
      </form>
    </Form>
  );
}
