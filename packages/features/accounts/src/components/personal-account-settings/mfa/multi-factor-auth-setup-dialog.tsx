'use client';

import { useState } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useSupabase } from '@tuckin/supabase/hooks';
import { Alert, AlertDescription, AlertTitle } from '@tuckin/ui/alert';
import { Button } from '@tuckin/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuckin/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuckin/ui/form';
import { Input } from '@tuckin/ui/input';
import { Spinner } from '@tuckin/ui/spinner';

type PendingFactor = { id: string; qrCode: string; secret: string };

export function MultiFactorAuthSetupDialog({
  onEnrolled,
}: {
  onEnrolled?: () => void;
}) {
  const client = useSupabase();
  const [open, setOpen] = useState(false);
  const [factor, setFactor] = useState<PendingFactor | null>(null);
  const [error, setError] = useState<string | null>(null);

  const begin = async () => {
    const { data, error } = await client.auth.mfa.enroll({
      factorType: 'totp',
    });

    if (error) {
      setError(error.message);

      return;
    }

    setFactor({
      id: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    });
  };

  const reset = () => {
    setFactor(null);
    setError(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);

        if (next) {
          void begin();
        } else {
          reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>Set up authenticator app</Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set up authenticator app</DialogTitle>
          <DialogDescription>
            Scan the QR code with your authenticator app, then enter the
            six-digit code it shows.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Enrollment failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : factor ? (
          <VerifyFactorForm
            client={client}
            factor={factor}
            onError={setError}
            onVerified={() => {
              setOpen(false);
              reset();
              onEnrolled?.();
            }}
          />
        ) : (
          <div className="flex items-center space-x-2">
            <Spinner />
            <span>Preparing your authenticator setup.</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function VerifyFactorForm({
  client,
  factor,
  onVerified,
  onError,
}: {
  client: ReturnType<typeof useSupabase>;
  factor: PendingFactor;
  onVerified: () => void;
  onError: (message: string) => void;
}) {
  const form = useForm({
    resolver: zodResolver(z.object({ code: z.string().min(6).max(6) })),
    defaultValues: { code: '' },
  });

  const onSubmit = async (values: { code: string }) => {
    const challenge = await client.auth.mfa.challenge({ factorId: factor.id });

    if (challenge.error) {
      onError(challenge.error.message);

      return;
    }

    const verify = await client.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challenge.data.id,
      code: values.code,
    });

    if (verify.error) {
      onError(verify.error.message);

      return;
    }

    onVerified();
  };

  return (
    <div className="flex flex-col space-y-4">
      <div className="flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="Authenticator QR code"
          src={factor.qrCode}
          width={180}
          height={180}
          className="bg-white p-2"
        />
      </div>

      <p className="text-muted-foreground text-center text-sm break-all">
        {factor.secret}
      </p>

      <Form {...form}>
        <form
          className="flex flex-col space-y-4"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Verification code</FormLabel>
                <FormControl>
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-end">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Verify and enable
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
