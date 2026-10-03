'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import {
  createDeal,
  createDealFromIntake,
  createDealFromIntakePdf,
} from '@odb/deals/server';
import { type DealSource, dealSourceSchema } from '@odb/deals/schema';
import { Button } from '@odb/ui/button';
import { Card, CardContent } from '@odb/ui/card';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';
import { Textarea } from '@odb/ui/textarea';

function sourceLabel(value: DealSource): string {
  return value[0]!.toUpperCase() + value.slice(1);
}

function toNumber(value: string): number | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : Number(trimmed);
}

function toText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function NewDealForm({
  accountId,
  detailBasePath,
}: {
  accountId: string;
  detailBasePath: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [listingUrl, setListingUrl] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState<DealSource>('manual');
  const [sourceUrl, setSourceUrl] = useState('');
  const [stage, setStage] = useState('sourcing');
  const [askingPrice, setAskingPrice] = useState('');
  const [revenueTtm, setRevenueTtm] = useState('');
  const [sdeTtm, setSdeTtm] = useState('');
  const [locationRaw, setLocationRaw] = useState('');
  const [employeeBand, setEmployeeBand] = useState('');
  const [website, setWebsite] = useState('');
  const [ownerRole, setOwnerRole] = useState('');
  const [reasonForSale, setReasonForSale] = useState('');
  const [yearEstablished, setYearEstablished] = useState('');
  const [intakeText, setIntakeText] = useState('');
  const [intakePdf, setIntakePdf] = useState<File | null>(null);

  // STUB: pasting a listing URL only seeds source + source_url; CaptureListing
  // extraction (fetching the listing and prefilling fields) is deferred.
  function onListingUrl(value: string) {
    setListingUrl(value);
    setSourceUrl(value);
    setSource('marketplace');
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const dealId = await createDeal({
          account_id: accountId,
          description,
          source,
          source_url: toText(sourceUrl),
          stage,
          asking_price: toNumber(askingPrice),
          revenue_ttm: toNumber(revenueTtm),
          sde_ttm: toNumber(sdeTtm),
          location_raw: toText(locationRaw),
          employee_band: toText(employeeBand),
          website: toText(website),
          owner_role: toText(ownerRole),
          reason_for_sale: toText(reasonForSale),
          year_established: toNumber(yearEstablished),
        });

        router.push(`${detailBasePath}/${dealId}`);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : 'Could not create the deal',
        );
      }
    });
  }

  function onExtractAndCreate() {
    setError(null);

    startTransition(async () => {
      try {
        const dealId = await createDealFromIntake({
          account_id: accountId,
          text: intakeText,
        });

        router.push(`${detailBasePath}/${dealId}`);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : 'Could not extract the deal',
        );
      }
    });
  }

  function onExtractPdfAndCreate() {
    if (intakePdf === null) return;

    setError(null);

    startTransition(async () => {
      try {
        const dealId = await createDealFromIntakePdf({
          account_id: accountId,
          pdf: await fileToBase64(intakePdf),
        });

        router.push(`${detailBasePath}/${dealId}`);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : 'Could not extract the deal',
        );
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className={'flex max-w-2xl flex-col gap-6'}>
      <Card>
        <CardContent className={'flex flex-col gap-2 pt-6'}>
          <Label htmlFor={'intake-text'}>Create with AI from pasted text</Label>
          <Textarea
            id={'intake-text'}
            value={intakeText}
            placeholder={'Paste a listing or CIM memo; AI extracts the deal and opens it for review'}
            onChange={(event) => setIntakeText(event.target.value)}
          />
          <Button
            type={'button'}
            variant={'outline'}
            disabled={pending || intakeText.trim() === ''}
            onClick={onExtractAndCreate}
          >
            {pending ? 'Extracting...' : 'Extract and create'}
          </Button>
          <Label htmlFor={'intake-pdf'}>Or upload a listing PDF</Label>
          <Input
            id={'intake-pdf'}
            type={'file'}
            accept={'.pdf'}
            onChange={(event) => setIntakePdf(event.target.files?.[0] ?? null)}
          />
          <Button
            type={'button'}
            variant={'outline'}
            disabled={pending || intakePdf === null}
            onClick={onExtractPdfAndCreate}
          >
            {pending ? 'Extracting...' : 'Extract PDF and create'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className={'flex flex-col gap-2 pt-6'}>
          <Label htmlFor={'listing-url'}>Paste listing URL</Label>
          <Input
            id={'listing-url'}
            type={'url'}
            placeholder={'https://'}
            value={listingUrl}
            onChange={(event) => onListingUrl(event.target.value)}
          />
          <p className={'text-muted-foreground text-xs'}>
            Seeds the source as marketplace. Automatic extraction is not wired up
            yet.
          </p>
        </CardContent>
      </Card>

      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'description'}>Description</Label>
        <Textarea
          id={'description'}
          required
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'source'}>Source</Label>
        <Select
          value={source}
          onValueChange={(value) => setSource(value as DealSource)}
        >
          <SelectTrigger id={'source'} className={'w-60'}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dealSourceSchema.options.map((value) => (
              <SelectItem key={value} value={value}>
                {sourceLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'source-url'}>Source URL</Label>
        <Input
          id={'source-url'}
          type={'url'}
          value={sourceUrl}
          onChange={(event) => setSourceUrl(event.target.value)}
        />
      </div>

      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'stage'}>Stage</Label>
        <Input
          id={'stage'}
          value={stage}
          onChange={(event) => setStage(event.target.value)}
        />
      </div>

      <div className={'grid grid-cols-1 gap-4 sm:grid-cols-3'}>
        <div className={'flex flex-col gap-2'}>
          <Label htmlFor={'asking-price'}>Asking price</Label>
          <Input
            id={'asking-price'}
            type={'number'}
            value={askingPrice}
            onChange={(event) => setAskingPrice(event.target.value)}
          />
        </div>
        <div className={'flex flex-col gap-2'}>
          <Label htmlFor={'revenue-ttm'}>Revenue (TTM)</Label>
          <Input
            id={'revenue-ttm'}
            type={'number'}
            value={revenueTtm}
            onChange={(event) => setRevenueTtm(event.target.value)}
          />
        </div>
        <div className={'flex flex-col gap-2'}>
          <Label htmlFor={'sde-ttm'}>SDE (TTM)</Label>
          <Input
            id={'sde-ttm'}
            type={'number'}
            value={sdeTtm}
            onChange={(event) => setSdeTtm(event.target.value)}
          />
        </div>
      </div>

      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'location-raw'}>Location</Label>
        <Input
          id={'location-raw'}
          value={locationRaw}
          onChange={(event) => setLocationRaw(event.target.value)}
        />
      </div>

      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'employee-band'}>Employee band</Label>
        <Input
          id={'employee-band'}
          value={employeeBand}
          onChange={(event) => setEmployeeBand(event.target.value)}
        />
      </div>

      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'website'}>Website</Label>
        <Input
          id={'website'}
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>

      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'owner-role'}>Owner role</Label>
        <Input
          id={'owner-role'}
          value={ownerRole}
          onChange={(event) => setOwnerRole(event.target.value)}
        />
      </div>

      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'reason-for-sale'}>Reason for sale</Label>
        <Input
          id={'reason-for-sale'}
          value={reasonForSale}
          onChange={(event) => setReasonForSale(event.target.value)}
        />
      </div>

      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'year-established'}>Year established</Label>
        <Input
          id={'year-established'}
          type={'number'}
          value={yearEstablished}
          onChange={(event) => setYearEstablished(event.target.value)}
        />
      </div>

      {error !== null ? (
        <p className={'text-destructive text-sm'}>{error}</p>
      ) : null}

      <div>
        <Button type={'submit'} disabled={pending}>
          {pending ? 'Creating...' : 'Create deal'}
        </Button>
      </div>
    </form>
  );
}
