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

import { verifyTotpChallenge } from '../lib/auth-flows';
import { VerifyTotpSchema } from '../schemas';
import { AuthErrorAlert } from './auth-error-alert';

export function MfaVerification({
  factorId,
  onVerified,
}: {
  factorId: string;
  onVerified?: () => void;
}) {
  const client = useSupabase();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(VerifyTotpSchema),
    defaultValues: { code: '' },
  });

  const onSubmit = async (values: z.output<typeof VerifyTotpSchema>) => {
    setErrorMessage(null);

    const { error } = await verifyTotpChallenge(client, {
      factorId,
      code: values.code,
    });

    if (error) {
      setErrorMessage(error.message);

      return;
    }

    onVerified?.();
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
          name={'code'}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Verification code</FormLabel>
              <FormControl>
                <Input
                  inputMode={'numeric'}
                  autoComplete={'one-time-code'}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type={'submit'} disabled={form.formState.isSubmitting}>
          Verify
        </Button>
      </form>
    </Form>
  );
}
