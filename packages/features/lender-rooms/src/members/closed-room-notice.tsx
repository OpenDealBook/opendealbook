import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@odb/ui/card';

import { teamName } from '../requests-ui/wording';
import { RequestAccessButton } from './request-access-button';

export function ClosedRoomNotice({
  roomId,
  roomName,
  dealName,
  contactEmail,
}: {
  roomId: string;
  roomName: string | null;
  dealName: string | null;
  contactEmail: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{roomName}</CardTitle>
        <CardDescription>{dealName}</CardDescription>
      </CardHeader>
      <CardContent className={'flex flex-col gap-2'}>
        <p>
          {`This room is closed. To ask ${teamName(dealName)} to reopen it, use the button below or write to `}
          <a className={'underline'} href={`mailto:${contactEmail}`}>
            {contactEmail}
          </a>
          .
        </p>
        <RequestAccessButton roomId={roomId} />
      </CardContent>
    </Card>
  );
}
