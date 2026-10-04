'use client';

import { useState, useTransition } from 'react';

import type { ImportCompsResult, VendorKey } from '@odb/comps';
import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { Label } from '@odb/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';
import { Spinner } from '@odb/ui/spinner';

import { importCompsAction } from '../actions';

const VENDORS: { value: VendorKey; label: string }[] = [
  { value: 'dealstats', label: 'DealStats' },
  { value: 'bizcomps', label: 'BIZCOMPS' },
  { value: 'peercomps', label: 'PeerComps' },
];

interface CompsImportFormProps {
  accountId: string;
}

export function CompsImportForm({ accountId }: CompsImportFormProps) {
  const [vendor, setVendor] = useState<VendorKey>('dealstats');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportCompsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!file) {
      return;
    }

    setResult(null);
    setError(null);

    const format = file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx';

    startTransition(async () => {
      try {
        const content = await file.text();
        const imported = await importCompsAction({
          accountId,
          vendor,
          filename: file.name,
          format,
          content,
        });
        setResult(imported);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Import failed');
      }
    });
  }

  return (
    <Card className={'max-w-xl'}>
      <CardHeader>
        <CardTitle>Vendor export</CardTitle>
      </CardHeader>
      <CardContent className={'flex flex-col gap-4'}>
        <div className={'flex flex-col gap-2'}>
          <Label htmlFor={'vendor'}>Vendor</Label>
          <Select
            value={vendor}
            onValueChange={(value) => setVendor(value as VendorKey)}
          >
            <SelectTrigger id={'vendor'}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VENDORS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={'flex flex-col gap-2'}>
          <Label htmlFor={'file'}>Export file (CSV)</Label>
          <input
            id={'file'}
            type={'file'}
            accept={'.csv'}
            className={'text-sm'}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </div>

        <Button disabled={!file || pending} onClick={submit}>
          {pending ? <Spinner className={'size-4'} /> : null}
          Import
        </Button>

        {result ? (
          <p className={'text-sm'}>
            Imported {result.rowCount} comp
            {result.rowCount === 1 ? '' : 's'} (import {result.importId}).
          </p>
        ) : null}

        {error ? <p className={'text-destructive text-sm'}>{error}</p> : null}
      </CardContent>
    </Card>
  );
}
