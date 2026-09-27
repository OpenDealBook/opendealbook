'use client';

import { useRouter } from 'next/navigation';

import { SignUpForm } from '@tuckin/auth';

export function SignUpRedirect({
  emailRedirectTo,
}: {
  emailRedirectTo?: string;
}) {
  const router = useRouter();

  return (
    <SignUpForm
      emailRedirectTo={emailRedirectTo}
      onSuccess={() => router.push('/home')}
    />
  );
}
