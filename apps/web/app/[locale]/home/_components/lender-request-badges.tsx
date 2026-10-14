import {
  type RequestProgress,
  isWaitingOnTeam,
} from '@odb/lender-rooms/requests-ui/wording.ts';
import { Badge } from '@odb/ui/badge';

import { requestStatusWording } from './lender-wording';

export function RequestBadges({
  isForm,
  request,
}: {
  isForm: boolean;
  request: RequestProgress;
}) {
  const isOutForSignature =
    request.status === 'open' && !isWaitingOnTeam(request);

  return (
    <>
      {isForm ? <Badge variant={'outline'}>Form</Badge> : null}
      {isOutForSignature ? null : (
        <Badge variant={request.status === 'open' ? 'default' : 'secondary'}>
          {requestStatusWording[request.status]}
        </Badge>
      )}
    </>
  );
}
