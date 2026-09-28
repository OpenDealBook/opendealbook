'use client';

import { useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { useSupabase } from '@odb/supabase/hooks';
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

import { requestPasswordReset } from '../lib/auth-flows';
import { PasswordResetRequestSchema } from '../schemas';
import { AuthErrorAlert } from './auth-error-alert';

export function PasswordResetRequestForm({
  redirectTo,
}: {
  redirectTo?: string;
}) {
  const client = useSupabase();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const form = useForm({
    resolver: zodResolver(PasswordResetRequestSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (
    values: z.output<typeof PasswordResetRequestSchema>,
  ) => {
    setErrorMessage(null);

    const { error } = await requestPasswordReset(client, {
      email: values.email,
      redirectTo,
    });

    if (error) {
      setErrorMessage(error.message);

      return;
    }

    setSent(true);
  };

  if (sent) {
    return <p>Check your email for a password reset link.</p>;
  }

  return (
    <Form {...form}>
      <form
        className={'flex flex-col gap-4'}
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <AuthErrorAlert message={errorMessage} />

        <FormField
          control={form.control}
          name={'email'}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type={'email'} autoComplete={'email'} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type={'submit'} disabled={form.formState.isSubmitting}>
          Send reset link
        </Button>
      </form>
    </Form>
  );
}
