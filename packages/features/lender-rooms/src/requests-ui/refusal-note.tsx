'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { SESSION_ENDED } from '../actions/refusal';
import type { AttemptProblem } from './use-attempt';
import { signInAgainPath } from './wording';

export function RefusalNote({
  refusal,
  signInPath,
}: {
  refusal: string | null;
  signInPath?: string;
}) {
  const pathname = usePathname();

  if (!refusal) {
    return null;
  }

  return (
    <p role={'alert'} className={'text-destructive text-sm'}>
      {refusal === SESSION_ENDED ? (
        <Link
          href={signInPath ?? signInAgainPath(pathname)}
          className={'inline-block py-1 font-medium underline'}
        >
          {refusal}
        </Link>
      ) : (
        refusal
      )}
    </p>
  );
}

export function ProblemNote({
  problem,
  signInPath,
  crashWording = 'Something went wrong. Try again.',
}: {
  problem: AttemptProblem | null;
  signInPath?: string;
  crashWording?: string;
}) {
  if (problem?.kind === 'crashed') {
    return (
      <p role={'alert'} className={'text-destructive text-sm'}>
        {crashWording}
      </p>
    );
  }

  return (
    <RefusalNote refusal={problem?.refusal ?? null} signInPath={signInPath} />
  );
}

export function LiveRegion({ message }: { message: string | null }) {
  return (
    <p role={'status'} aria-live={'polite'} className={'sr-only'}>
      {message}
    </p>
  );
}
