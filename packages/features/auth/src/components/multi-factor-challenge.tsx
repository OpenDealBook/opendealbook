'use client';

import { useEffect, useState } from 'react';

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
import { Spinner } from '@odb/ui/spinner';

import { challengeAndVerifyTotp, consumeRecoveryCode } from '../lib/auth-flows';
import { RecoveryCodeSchema, VerifyTotpSchema } from '../schemas';
import { AuthErrorAlert } from './auth-error-alert';

export function MultiFactorChallenge({
  onVerified,
}: {
  onVerified?: () => void;
}) {
  const client = useSupabase();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [useRecovery, setUseRecovery] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void client.auth.mfa.listFactors().then(({ data, error }) => {
      if (!active) {
        return;
      }

      if (error) {
        setErrorMessage(error.message);
        setChecking(false);

        return;
      }

      const verifiedTotp = data.totp.find(
        (factor) => factor.status === 'verified',
      );

      setFactorId(verifiedTotp?.id ?? null);
      setUseRecovery(!verifiedTotp);
      setChecking(false);
    });

    return () => {
      active = false;
    };
  }, [client]);

  if (checking) {
    return <Spinner />;
  }

  if (useRecovery || !factorId) {
    return (
      <div className={'flex flex-col gap-4'}>
        <AuthErrorAlert message={errorMessage} />

        <RecoveryCodeForm onVerified={onVerified} />

        {factorId ? (
          <FactorToggle onClick={() => setUseRecovery(false)}>
            Use your authenticator app
          </FactorToggle>
        ) : null}
      </div>
    );
  }

  return (
    <div className={'flex flex-col gap-4'}>
      <AuthErrorAlert message={errorMessage} />

      <TotpChallengeForm factorId={factorId} onVerified={onVerified} />

      <FactorToggle onClick={() => setUseRecovery(true)}>
        Use a recovery code
      </FactorToggle>
    </div>
  );
}

function TotpChallengeForm({
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

    const { error } = await challengeAndVerifyTotp(client, {
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

function RecoveryCodeForm({ onVerified }: { onVerified?: () => void }) {
  const client = useSupabase();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(RecoveryCodeSchema),
    defaultValues: { code: '' },
  });

  const onSubmit = async (values: z.output<typeof RecoveryCodeSchema>) => {
    setErrorMessage(null);

    const { data, error } = await consumeRecoveryCode(client, values.code);

    if (error) {
      setErrorMessage(error.message);

      return;
    }

    if (!data) {
      setErrorMessage('Invalid recovery code');

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
              <FormLabel>Recovery code</FormLabel>
              <FormControl>
                <Input autoComplete={'one-time-code'} {...field} />
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

function FactorToggle({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type={'button'}
      onClick={onClick}
      className={
        'text-muted-foreground hover:text-primary text-sm underline-offset-4 hover:underline'
      }
    >
      {children}
    </button>
  );
}
