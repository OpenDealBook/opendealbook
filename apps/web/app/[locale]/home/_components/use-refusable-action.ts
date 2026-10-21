'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

type Refused = { ok: false; refusal: string };

export function useRefusableAction() {
  const router = useRouter();
  const [refusal, setRefusal] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run<Value>(
    action: () => Promise<{ ok: true; value: Value } | Refused>,
    onDone?: (value: Value) => void,
  ): void;
  function run(
    action: () => Promise<{ readonly ok: true } | Refused>,
    onDone?: () => void,
  ): void;
  function run(
    action: () => Promise<{ ok: true; value?: unknown } | Refused>,
    onDone?: (value: unknown) => void,
  ) {
    startTransition(async () => {
      const result = await action();

      if (!result.ok) {
        setRefusal(result.refusal);
        return;
      }

      setRefusal(null);
      onDone?.(result.value);
      router.refresh();
    });
  }

  return { refusal, pending, run };
}
