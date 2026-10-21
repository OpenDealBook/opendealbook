'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import {
  type DealIntakeDraft,
  type DealSource,
  dealSourceSchema,
} from '@odb/deals/schema';
import {
  createDeal,
  createDealFromIntake,
  extractDealIntakeFromPdf,
  extractDealIntakeFromText,
} from '@odb/deals/server';
import { industryChoiceFor } from '@odb/deals/shared';
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

import { useRefusableAction } from './use-refusable-action';

const OTHER_INDUSTRY = 'other';

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
  industries,
  existingBusinessNames,
}: {
  accountId: string;
  detailBasePath: string;
  industries: Array<{ id: string; name: string }>;
  existingBusinessNames: string[];
}) {
  const router = useRouter();
  const { refusal, pending, run } = useRefusableAction();

  const [businessName, setBusinessName] = useState('');
  const [industryChoice, setIndustryChoice] = useState('');
  const [otherIndustry, setOtherIndustry] = useState('');
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
  const [draft, setDraft] = useState<DealIntakeDraft | null>(null);

  const duplicateName = existingBusinessNames.some(
    (name) =>
      name.trim().toLowerCase() === businessName.trim().toLowerCase(),
  );

  function identity() {
    return {
      account_id: accountId,
      business_name: businessName,
      industry_id:
        industryChoice === '' || industryChoice === OTHER_INDUSTRY
          ? undefined
          : industryChoice,
      industry:
        industryChoice === OTHER_INDUSTRY ? toText(otherIndustry) : undefined,
    };
  }

  function openDeal(dealId: string) {
    router.push(`${detailBasePath}/${dealId}`);
  }

  function onListingUrl(value: string) {
    setListingUrl(value);
    setSourceUrl(value);
    setSource('marketplace');
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    run(
      () =>
        createDeal({
          ...identity(),
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
        }),
      openDeal,
    );
  }

  function prefill(extracted: DealIntakeDraft) {
    const choice = industryChoiceFor(industries, extracted.industry);

    setDraft(extracted);
    setIndustryChoice(
      choice.industry_id ?? (choice.industry ? OTHER_INDUSTRY : ''),
    );
    setOtherIndustry(choice.industry ?? '');
  }

  function onExtract() {
    run(
      () =>
        extractDealIntakeFromText({ account_id: accountId, text: intakeText }),
      prefill,
    );
  }

  function onExtractPdf() {
    if (intakePdf === null) return;

    const pdf = intakePdf;

    run(
      async () =>
        extractDealIntakeFromPdf({
          account_id: accountId,
          pdf: await fileToBase64(pdf),
        }),
      prefill,
    );
  }

  function onCreateFromDraft(extracted: DealIntakeDraft) {
    run(
      () => createDealFromIntake({ ...identity(), draft: extracted }),
      openDeal,
    );
  }

  return (
    <form onSubmit={onSubmit} className={'flex max-w-2xl flex-col gap-6'}>
      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'business-name'}>Business name</Label>
        <Input
          id={'business-name'}
          required
          value={businessName}
          onChange={(event) => setBusinessName(event.target.value)}
        />
        {duplicateName ? (
          <p className={'text-warning text-xs'}>
            Another deal in this team already uses this business name.
          </p>
        ) : null}
      </div>

      <div className={'flex flex-col gap-2'}>
        <Label htmlFor={'industry'}>Industry</Label>
        <Select value={industryChoice} onValueChange={setIndustryChoice}>
          <SelectTrigger id={'industry'} className={'w-60'}>
            <SelectValue placeholder={'Pick an industry'} />
          </SelectTrigger>
          <SelectContent>
            {industries.map((industry) => (
              <SelectItem key={industry.id} value={industry.id}>
                {industry.name}
              </SelectItem>
            ))}
            <SelectItem value={OTHER_INDUSTRY}>Other</SelectItem>
          </SelectContent>
        </Select>
        {industryChoice === OTHER_INDUSTRY ? (
          <Input
            id={'other-industry'}
            aria-label={'Other industry'}
            required
            value={otherIndustry}
            onChange={(event) => setOtherIndustry(event.target.value)}
          />
        ) : null}
      </div>

      <Card>
        <CardContent className={'flex flex-col gap-2 pt-6'}>
          <Label htmlFor={'intake-text'}>Create with AI from pasted text</Label>
          <Textarea
            id={'intake-text'}
            value={intakeText}
            placeholder={'Paste a listing or CIM memo; AI extracts the deal for you to check'}
            onChange={(event) => setIntakeText(event.target.value)}
          />
          <Button
            type={'button'}
            variant={'outline'}
            disabled={pending || intakeText.trim() === ''}
            onClick={onExtract}
          >
            {pending ? 'Extracting...' : 'Extract'}
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
            onClick={onExtractPdf}
          >
            {pending ? 'Extracting...' : 'Extract PDF'}
          </Button>
          {draft !== null ? (
            <>
              <p className={'text-muted-foreground text-xs'}>
                Extracted. Check the business name and industry above, then
                create the deal.
              </p>
              <Button
                type={'button'}
                disabled={pending}
                onClick={() => onCreateFromDraft(draft)}
              >
                {pending ? 'Creating...' : 'Create deal from extract'}
              </Button>
            </>
          ) : null}
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
            Seeds the source as marketplace.
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

      {refusal !== null ? (
        <p className={'text-destructive text-sm'}>{refusal}</p>
      ) : null}

      <div>
        <Button type={'submit'} disabled={pending}>
          {pending ? 'Creating...' : 'Create deal'}
        </Button>
      </div>
    </form>
  );
}
