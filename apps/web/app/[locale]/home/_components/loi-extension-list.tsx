import type { ReactNode } from 'react';

import type { ContractVersionView } from '@odb/contracts';
import { Badge } from '@odb/ui/badge';

import type { ExtensionState } from '../_lib/loi-extensions';

const STATE_LABEL: Record<ExtensionState, string> = {
  draft: 'Draft',
  out: 'Out for signature',
  signed: 'Signed',
  noted: 'Noted',
};

export interface LoiExtension<Version extends ContractVersionView> {
  id: string;
  extends_to: string;
  note: string | null;
  noted_on: string | null;
  state: ExtensionState;
  versions: Version[];
}

const day = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  dateStyle: 'medium',
});

export function LoiExtensionList<
  Extension extends LoiExtension<ContractVersionView>,
>({
  extensions,
  filesPath,
  actions,
  body,
}: {
  extensions: Extension[];
  filesPath: string;
  actions: (extension: Extension) => ReactNode;
  body: (extension: Extension) => ReactNode;
}) {
  return (
    <section className={'flex flex-col gap-2'}>
      <h3 className={'text-sm font-semibold'}>Extensions</h3>
      <ul className={'flex flex-col divide-y rounded-md border'}>
        {extensions.map((extension) => (
          <li
            key={extension.id}
            data-extension
            className={'flex flex-col gap-4 p-3'}
          >
            <div
              className={
                'flex flex-wrap items-center justify-between gap-x-4 gap-y-2'
              }
            >
              <div className={'flex flex-wrap items-center gap-2'}>
                <h4 className={'font-medium'}>
                  LOI extension to {day.format(new Date(extension.extends_to))}
                </h4>
                <Badge
                  variant={extension.state === 'signed' ? 'default' : 'outline'}
                >
                  {STATE_LABEL[extension.state]}
                </Badge>
              </div>
              <div
                data-extension-actions
                className={
                  'flex flex-wrap items-center gap-x-3 gap-y-2 text-sm'
                }
              >
                {extension.versions
                  .filter((version) => version.is_signed)
                  .map((version) => (
                    <a
                      key={version.id}
                      className={'underline'}
                      href={`${filesPath}/${version.id}/${version.hasPdf ? 'pdf' : 'docx'}`}
                    >
                      Signed copy
                    </a>
                  ))}
                {actions(extension)}
              </div>
            </div>
            {extension.noted_on === null ? null : (
              <p
                data-extension-noted
                className={'text-muted-foreground text-sm whitespace-pre-line'}
              >
                Agreed on {day.format(new Date(extension.noted_on))}
                {extension.note === null ? null : `: ${extension.note}`}
              </p>
            )}
            {extension.versions.length > 0 ? body(extension) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
