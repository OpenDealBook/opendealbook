'use client';

import { useState, useTransition } from 'react';

import { createDocumentSignedUrl } from '@odb/data-room/documents/actions';
import { Button } from '@odb/ui/button';
import { Spinner } from '@odb/ui/spinner';

interface DataRoomDocumentLinkProps {
  dealId: string;
  documentId: string;
}

export function DataRoomDocumentLink({
  dealId,
  documentId,
}: DataRoomDocumentLinkProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onOpen() {
    startTransition(async () => {
      setError(null);

      try {
        const url = await createDocumentSignedUrl({ dealId, documentId });

        window.open(url, '_blank', 'noopener,noreferrer');
      } catch {
        setError('Unavailable until the data-room storage bucket is provisioned');
      }
    });
  }

  return (
    <div className={'flex flex-col items-end gap-1'}>
      <Button
        type={'button'}
        variant={'outline'}
        size={'sm'}
        onClick={onOpen}
        disabled={isPending}
      >
        {isPending ? <Spinner /> : null}
        Open
      </Button>
      {error ? (
        <span className={'text-destructive text-xs'}>{error}</span>
      ) : null}
    </div>
  );
}
