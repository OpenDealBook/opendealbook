'use client';

import { useParams } from 'next/navigation';

import { Button } from '@odb/ui/button';

export function openDataRoomWindow({
  account,
  dealId,
  ...cited
}: {
  account: string;
  dealId: string;
  doc?: string;
  page?: number;
  sheet?: string;
}) {
  const view = `/deal-windows/${account}/${dealId}/data-room/view`;
  const query = new URLSearchParams(
    Object.entries(cited).flatMap(([key, value]) =>
      value === undefined ? [] : [[key, String(value)]],
    ),
  ).toString();

  window.open(
    query ? `${view}?${query}` : view,
    `data-room-${dealId}`,
    'popup',
  );
}

export function DataRoomDocumentLink({
  dealId,
  documentId,
}: {
  dealId: string;
  documentId: string;
}) {
  const { account } = useParams<{ account: string }>();

  return (
    <Button
      type={'button'}
      variant={'outline'}
      size={'sm'}
      onClick={() => openDataRoomWindow({ account, dealId, doc: documentId })}
    >
      Open
    </Button>
  );
}

export function OpenDataRoomWindow() {
  const { account, id } = useParams<{ account: string; id: string }>();

  return (
    <Button
      type={'button'}
      variant={'outline'}
      size={'sm'}
      onClick={() => openDataRoomWindow({ account, dealId: id })}
    >
      Open in data room window
    </Button>
  );
}
