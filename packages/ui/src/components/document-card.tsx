'use client';

import * as React from 'react';

import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/card';
import { FileTextIcon } from 'lucide-react';

function DocumentCard({
  name,
  kind,
  version,
  updatedAt,
  onOpen,
  actions,
}: {
  name: string;
  kind?: string;
  version?: number;
  updatedAt?: string;
  onOpen?: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <Card data-slot="document-card">
      <CardHeader>
        <div className="flex min-w-0 items-center gap-3">
          <FileTextIcon
            data-slot="document-card-icon"
            className="text-muted-foreground shrink-0"
          />
          <div className="flex min-w-0 flex-col gap-1">
            {onOpen ? (
              <button
                type="button"
                data-slot="document-card-open"
                onClick={onOpen}
                className="w-full text-left"
              >
                <CardTitle className="truncate">{name}</CardTitle>
              </button>
            ) : (
              <CardTitle className="truncate">{name}</CardTitle>
            )}
            <CardDescription
              data-slot="document-card-meta"
              className="flex flex-wrap gap-x-2"
            >
              {kind ? <span data-slot="document-card-kind">{kind}</span> : null}
              {version !== undefined ? (
                <span data-slot="document-card-version">v{version}</span>
              ) : null}
              {updatedAt ? (
                <span data-slot="document-card-updated">{updatedAt}</span>
              ) : null}
            </CardDescription>
          </div>
        </div>
        {actions ? <CardAction>{actions}</CardAction> : null}
      </CardHeader>
    </Card>
  );
}

export { DocumentCard };
