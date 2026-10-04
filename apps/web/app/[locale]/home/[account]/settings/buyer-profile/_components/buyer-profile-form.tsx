'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import { Textarea } from '@odb/ui/textarea';

import { saveBuyerProfileAction } from '../actions';

interface BuyerProfileFormProps {
  accountId: string;
  initial: {
    display_name: string;
    headline: string;
    about: string;
    experience: string;
    motivation: string;
    target_statement: string;
    value_proposition: string;
  };
}

export function BuyerProfileForm({ accountId, initial }: BuyerProfileFormProps) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [isSaving, startSaving] = useTransition();

  function set(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setSaved(false);
  }

  function onSave() {
    startSaving(async () => {
      await saveBuyerProfileAction({
        accountId,
        display_name: values.display_name || null,
        headline: values.headline || null,
        about: values.about || null,
        experience: values.experience || null,
        motivation: values.motivation || null,
        target_statement: values.target_statement || null,
        value_proposition: values.value_proposition || null,
      });
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className={'flex flex-col gap-6'}>
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
        </CardHeader>
        <CardContent className={'flex flex-col gap-4'}>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'display-name'}>Display name</Label>
            <Input
              id={'display-name'}
              value={values.display_name}
              onChange={(event) => set('display_name', event.target.value)}
            />
          </div>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'headline'}>Headline</Label>
            <Input
              id={'headline'}
              value={values.headline}
              onChange={(event) => set('headline', event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Narrative</CardTitle>
        </CardHeader>
        <CardContent className={'flex flex-col gap-4'}>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'about'}>About</Label>
            <Textarea
              id={'about'}
              value={values.about}
              onChange={(event) => set('about', event.target.value)}
            />
          </div>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'experience'}>Experience</Label>
            <Textarea
              id={'experience'}
              value={values.experience}
              onChange={(event) => set('experience', event.target.value)}
            />
          </div>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'motivation'}>Motivation</Label>
            <Textarea
              id={'motivation'}
              value={values.motivation}
              onChange={(event) => set('motivation', event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Acquisition thesis</CardTitle>
        </CardHeader>
        <CardContent className={'flex flex-col gap-4'}>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'target-statement'}>Target statement</Label>
            <Textarea
              id={'target-statement'}
              value={values.target_statement}
              onChange={(event) => set('target_statement', event.target.value)}
            />
          </div>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'value-proposition'}>Value proposition</Label>
            <Textarea
              id={'value-proposition'}
              value={values.value_proposition}
              onChange={(event) =>
                set('value_proposition', event.target.value)
              }
            />
          </div>
        </CardContent>
      </Card>

      <div className={'flex items-center gap-3'}>
        <Button type={'button'} onClick={onSave} disabled={isSaving}>
          {isSaving ? 'Saving' : 'Save profile'}
        </Button>
        {saved ? (
          <span className={'text-muted-foreground text-sm'}>Saved</span>
        ) : null}
      </div>
    </div>
  );
}
