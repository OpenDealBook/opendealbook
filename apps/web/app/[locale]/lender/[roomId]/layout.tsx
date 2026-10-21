import type { ReactNode } from 'react';

import { PurgeUnfinishedUploads } from '@odb/lender-rooms/browser/purge-unfinished-uploads.tsx';
import { loadClosedRoomContactEmail } from '@odb/lender-rooms/members/closed-room-contact.ts';
import { ClosedRoomNotice } from '@odb/lender-rooms/members/closed-room-notice.tsx';
import { enterLenderRoom } from '@odb/lender-rooms/members/enter-room.ts';
import { LenderNameForm } from '@odb/lender-rooms/members/lender-name-form.tsx';
import {
  shouldAskLenderName,
  shouldAskLenderPhone,
} from '@odb/lender-rooms/members/person-name.ts';
import { myOpenRoomIds } from '@odb/lender-rooms/members/room-gate.ts';
import { getSupabaseServerAdminClient } from '@odb/supabase/admin';
import { getSupabaseServerClient } from '@odb/supabase/server';

import { PhonePrompt } from '../../_components/phone-prompt';

export default async function LenderRoomLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;

  const gate = await enterLenderRoom(roomId);

  if (await shouldAskLenderName(getSupabaseServerClient())) {
    return (
      <main>
        <LenderNameForm initialName={null} allowSkip />
      </main>
    );
  }

  if (await shouldAskLenderPhone(getSupabaseServerClient())) {
    return (
      <main>
        <PhonePrompt />
      </main>
    );
  }

  if (gate.kind === 'open') {
    return <>{children}</>;
  }

  const client = getSupabaseServerClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  const [contactEmail, openRoomIds] = await Promise.all([
    loadClosedRoomContactEmail(getSupabaseServerAdminClient(), roomId),
    myOpenRoomIds(client),
  ]);

  return (
    <main>
      <PurgeUnfinishedUploads userId={user!.id} openRoomIds={openRoomIds} />
      <ClosedRoomNotice
        roomId={roomId}
        roomName={gate.room.name}
        dealName={gate.room.deal_name}
        contactEmail={contactEmail}
      />
    </main>
  );
}
