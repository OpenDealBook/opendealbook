'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { upsertDealThesis } from '@odb/deals/server';
import type { Tables } from '@odb/supabase';
import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';

const FIELDS = [
  { key: 'why_this_business', label: 'Why this business', max: 2000 },
  { key: 'main_concerns', label: 'Main concerns', max: 2000 },
  { key: 'post_acquisition_plan', label: 'Post-acquisition plan', max: 2500 },
  { key: 'owner_involvement', label: 'Owner involvement', max: 2000 },
  { key: 'additional_info', label: 'Additional info', max: 5000 },
] as const;

type FieldKey = (typeof FIELDS)[number]['key'];

export function ThesisSection({
  deal_id,
  thesis,
}: {
  deal_id: string;
  thesis: Tables<'deal_thesis'> | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<FieldKey, string>>(() => ({
    why_this_business: thesis?.why_this_business ?? '',
    main_concerns: thesis?.main_concerns ?? '',
    post_acquisition_plan: thesis?.post_acquisition_plan ?? '',
    owner_involvement: thesis?.owner_involvement ?? '',
    additional_info: thesis?.additional_info ?? '',
  }));

  function save() {
    startTransition(async () => {
      await upsertDealThesis({ deal_id, ...values });
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thesis</CardTitle>
      </CardHeader>
      <CardContent className={'flex flex-col gap-6'}>
        {thesis === null ? (
          <p className={'text-muted-foreground text-sm'}>
            No thesis yet. Capture your internal, broker-facing notes below.
          </p>
        ) : null}
        {FIELDS.map((field) => (
          <div key={field.key} className={'flex flex-col gap-1.5'}>
            <div className={'flex items-center justify-between'}>
              <Label htmlFor={field.key}>{field.label}</Label>
              <span className={'text-muted-foreground text-xs'}>
                {values[field.key].length} / {field.max}
              </span>
            </div>
            <Textarea
              id={field.key}
              maxLength={field.max}
              value={values[field.key]}
              onChange={(event) =>
                setValues((prev) => ({
                  ...prev,
                  [field.key]: event.target.value,
                }))
              }
            />
          </div>
        ))}
        <div>
          <Button onClick={save} disabled={pending}>
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
