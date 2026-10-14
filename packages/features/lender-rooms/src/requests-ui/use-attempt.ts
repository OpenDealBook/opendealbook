'use client';

import { useRef, useState, useTransition } from 'react';

import type { ActionResult } from '../actions/refusal';

export type AttemptProblem =
  | { kind: 'refused'; refusal: string }
  | { kind: 'crashed' };

export function useAttempt() {
  const [problem, setProblem] = useState<AttemptProblem | null>(null);
  const [isPending, startTransition] = useTransition();
  const isRunning = useRef(false);

  function attempt(
    action: () => Promise<ActionResult<unknown>>,
    onAccepted: () => void,
  ) {
    if (isRunning.current) {
      return;
    }

    isRunning.current = true;

    startTransition(async () => {
      setProblem(null);

      try {
        const result = await action();

        if (result.ok) {
          onAccepted();
        } else {
          setProblem({ kind: 'refused', refusal: result.refusal });
        }
      } catch {
        setProblem({ kind: 'crashed' });
      } finally {
        isRunning.current = false;
      }
    });
  }

  return { problem, isPending, attempt };
}
