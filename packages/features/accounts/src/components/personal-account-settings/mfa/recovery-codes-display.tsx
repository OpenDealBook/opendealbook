'use client';

import { Alert, AlertDescription, AlertTitle } from '@tuckin/ui/alert';
import { Button } from '@tuckin/ui/button';

export function RecoveryCodesDisplay({ codes }: { codes: string[] }) {
  const asText = codes.join('\n');

  const copy = () => {
    void navigator.clipboard.writeText(asText);
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([asText], { type: 'text/plain' }));
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = 'recovery-codes.txt';
    anchor.click();

    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col space-y-4">
      <Alert>
        <AlertTitle>Save these recovery codes</AlertTitle>
        <AlertDescription>
          Each code works once. They are shown now and cannot be retrieved
          again. Store them somewhere safe.
        </AlertDescription>
      </Alert>

      <ul className="grid grid-cols-2 gap-2 rounded-md border p-4 font-mono text-sm">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>

      <div className="flex space-x-2">
        <Button type="button" variant="outline" onClick={copy}>
          Copy codes
        </Button>
        <Button type="button" variant="outline" onClick={download}>
          Download codes
        </Button>
      </div>
    </div>
  );
}
