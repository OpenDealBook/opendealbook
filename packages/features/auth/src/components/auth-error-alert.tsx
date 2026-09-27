import { Alert, AlertDescription, AlertTitle } from '@tuckin/ui/alert';

export function AuthErrorAlert({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <Alert variant={'destructive'}>
      <AlertTitle>Authentication error</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
