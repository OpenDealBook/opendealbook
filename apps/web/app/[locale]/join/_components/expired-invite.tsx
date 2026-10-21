import { Alert, AlertDescription, AlertTitle } from '@odb/ui/alert';

export function ExpiredInvite() {
  return (
    <Alert className={'w-full max-w-sm'}>
      <AlertTitle>Invitation unavailable</AlertTitle>
      <AlertDescription>
        This invite has expired or was already used. Ask for a new one.
      </AlertDescription>
    </Alert>
  );
}
