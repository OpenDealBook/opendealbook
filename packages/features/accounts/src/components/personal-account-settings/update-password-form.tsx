'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';

import { Alert, AlertDescription, AlertTitle } from '@odb/ui/alert';
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
  UpdatePasswordSchema,
  type UpdatePasswordPayload,
} from '../../schema/update-password.schema';
import { updatePasswordAction } from '../../server/personal-account-actions';

export function UpdatePasswordForm() {
  const form = useForm<UpdatePasswordPayload>({
    resolver: zodResolver(UpdatePasswordSchema),
    defaultValues: { newPassword: '', repeatPassword: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: UpdatePasswordPayload) => updatePasswordAction(values),
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
            <AlertTitle>Password updated</AlertTitle>
            <AlertDescription>Your password has been changed.</AlertDescription>
          </Alert>
        ) : null}

        {mutation.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Update failed</AlertTitle>
            <AlertDescription>
              Your password could not be updated.
            </AlertDescription>
          </Alert>
        ) : null}

        <FormField
          name="newPassword"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          name="repeatPassword"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Repeat password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div>
          <Button type="submit" disabled={mutation.isPending}>
            Update password
          </Button>
        </div>
      </form>
    </Form>
  );
}
