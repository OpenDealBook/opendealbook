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

import { updatePassword } from '../lib/auth-flows';
import { PasswordUpdateSchema } from '../schemas';
import { AuthErrorAlert } from './auth-error-alert';

export function PasswordUpdateForm({ onUpdated }: { onUpdated?: () => void }) {
  const client = useSupabase();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(PasswordUpdateSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = async (values: z.output<typeof PasswordUpdateSchema>) => {
    setErrorMessage(null);

    const { error } = await updatePassword(client, {
      password: values.password,
    });

    if (error) {
      setErrorMessage(error.message);

      return;
    }

    onUpdated?.();
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
          name={'password'}
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
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
              <FormLabel>Confirm new password</FormLabel>
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
          Update password
        </Button>
      </form>
    </Form>
  );
}
