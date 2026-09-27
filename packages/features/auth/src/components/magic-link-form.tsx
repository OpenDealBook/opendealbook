'use client';

import { useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';

import { useSupabase } from '@tuckin/supabase/hooks';
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

import { sendMagicLink } from '../lib/auth-flows';
import { MagicLinkSchema } from '../schemas';
import { AuthErrorAlert } from './auth-error-alert';

export function MagicLinkForm({
  emailRedirectTo,
}: {
  emailRedirectTo?: string;
}) {
  const client = useSupabase();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const form = useForm({
    resolver: zodResolver(MagicLinkSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: z.output<typeof MagicLinkSchema>) => {
    setErrorMessage(null);

    const { error } = await sendMagicLink(client, {
      email: values.email,
      emailRedirectTo,
    });

    if (error) {
      setErrorMessage(error.message);

      return;
    }

    setSent(true);
  };

  if (sent) {
    return <p>Check your email for a sign-in link.</p>;
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
          Send magic link
        </Button>
      </form>
    </Form>
  );
}
