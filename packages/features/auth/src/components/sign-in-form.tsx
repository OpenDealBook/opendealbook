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

import { signInWithPassword } from '../lib/auth-flows';
import { SignInSchema } from '../schemas';
import { AuthErrorAlert } from './auth-error-alert';

export function SignInForm({ onSuccess }: { onSuccess?: () => void }) {
  const client = useSupabase();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(SignInSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: z.output<typeof SignInSchema>) => {
    setErrorMessage(null);

    const { data, error } = await signInWithPassword(client, values);

    if (error) {
      setErrorMessage(error.message);

      return;
    }

    if (data.session) {
      onSuccess?.();
    }
  };

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

        <FormField
          control={form.control}
          name={'password'}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input
                  type={'password'}
                  autoComplete={'current-password'}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type={'submit'} disabled={form.formState.isSubmitting}>
          Sign in
        </Button>
      </form>
    </Form>
  );
}
