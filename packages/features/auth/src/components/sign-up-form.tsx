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

import { signUpWithPassword } from '../lib/auth-flows';
import { SignUpSchema } from '../schemas';
import { AuthErrorAlert } from './auth-error-alert';

export function SignUpForm({ emailRedirectTo }: { emailRedirectTo?: string }) {
  const client = useSupabase();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(SignUpSchema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = async (values: z.output<typeof SignUpSchema>) => {
    setErrorMessage(null);

    const { error } = await signUpWithPassword(client, {
      email: values.email,
      password: values.password,
      emailRedirectTo,
    });

    if (error) {
      setErrorMessage(error.message);
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
                  autoComplete={'new-password'}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name={'confirmPassword'}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm password</FormLabel>
              <FormControl>
                <Input
                  type={'password'}
                  autoComplete={'new-password'}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type={'submit'} disabled={form.formState.isSubmitting}>
          Sign up
        </Button>
      </form>
    </Form>
  );
}
