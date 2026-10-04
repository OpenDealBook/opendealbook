'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { Checkbox } from '@odb/ui/checkbox';
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
    expertise_areas: string[];
    financing: {
      cash_available: string;
      max_purchase_price: string;
      sba_prequalified: boolean;
    };
    contact: { email: string; phone: string; website: string };
    interested: string[];
    not_interested: string[];
    include_sensitive: boolean;
    sensitive: { credit_score: string; pre_approval: string; phone: string };
  };
}

function StringListEditor({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className={'flex flex-col gap-2'}>
      <Label>{label}</Label>
      {items.map((item, index) => (
        <div key={index} className={'flex items-center gap-2'}>
          <Input
            value={item}
            onChange={(event) => {
              const next = [...items];
              next[index] = event.target.value;
              onChange(next);
            }}
          />
          <Button
            type={'button'}
            variant={'outline'}
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        type={'button'}
        variant={'outline'}
        onClick={() => onChange([...items, ''])}
      >
        Add
      </Button>
    </div>
  );
}

export function BuyerProfileForm({ accountId, initial }: BuyerProfileFormProps) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [isSaving, startSaving] = useTransition();

  function update(patch: Partial<typeof values>) {
    setValues((current) => ({ ...current, ...patch }));
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
        expertise_json: { areas: values.expertise_areas },
        financing_json: values.financing,
        contact_json: values.contact,
        interested_json: values.interested,
        not_interested_json: values.not_interested,
        include_sensitive: values.include_sensitive,
        sensitive_json: values.sensitive,
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
              onChange={(event) => update({ display_name: event.target.value })}
            />
          </div>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'headline'}>Headline</Label>
            <Input
              id={'headline'}
              value={values.headline}
              onChange={(event) => update({ headline: event.target.value })}
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
              onChange={(event) => update({ about: event.target.value })}
            />
          </div>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'experience'}>Experience</Label>
            <Textarea
              id={'experience'}
              value={values.experience}
              onChange={(event) => update({ experience: event.target.value })}
            />
          </div>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'motivation'}>Motivation</Label>
            <Textarea
              id={'motivation'}
              value={values.motivation}
              onChange={(event) => update({ motivation: event.target.value })}
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
              onChange={(event) =>
                update({ target_statement: event.target.value })
              }
            />
          </div>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'value-proposition'}>Value proposition</Label>
            <Textarea
              id={'value-proposition'}
              value={values.value_proposition}
              onChange={(event) =>
                update({ value_proposition: event.target.value })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Expertise</CardTitle>
        </CardHeader>
        <CardContent className={'flex flex-col gap-4'}>
          <StringListEditor
            label={'Areas'}
            items={values.expertise_areas}
            onChange={(next) => update({ expertise_areas: next })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Financing</CardTitle>
        </CardHeader>
        <CardContent className={'flex flex-col gap-4'}>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'cash-available'}>Cash available</Label>
            <Input
              id={'cash-available'}
              value={values.financing.cash_available}
              onChange={(event) =>
                update({
                  financing: {
                    ...values.financing,
                    cash_available: event.target.value,
                  },
                })
              }
            />
          </div>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'max-purchase-price'}>Max purchase price</Label>
            <Input
              id={'max-purchase-price'}
              value={values.financing.max_purchase_price}
              onChange={(event) =>
                update({
                  financing: {
                    ...values.financing,
                    max_purchase_price: event.target.value,
                  },
                })
              }
            />
          </div>
          <div className={'flex items-center gap-2'}>
            <Checkbox
              id={'sba-prequalified'}
              checked={values.financing.sba_prequalified}
              onCheckedChange={(checked) =>
                update({
                  financing: {
                    ...values.financing,
                    sba_prequalified: checked === true,
                  },
                })
              }
            />
            <Label htmlFor={'sba-prequalified'}>SBA pre-qualified</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
        </CardHeader>
        <CardContent className={'flex flex-col gap-4'}>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'contact-email'}>Email</Label>
            <Input
              id={'contact-email'}
              value={values.contact.email}
              onChange={(event) =>
                update({
                  contact: { ...values.contact, email: event.target.value },
                })
              }
            />
          </div>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'contact-phone'}>Phone</Label>
            <Input
              id={'contact-phone'}
              value={values.contact.phone}
              onChange={(event) =>
                update({
                  contact: { ...values.contact, phone: event.target.value },
                })
              }
            />
          </div>
          <div className={'flex flex-col gap-2'}>
            <Label htmlFor={'contact-website'}>Website</Label>
            <Input
              id={'contact-website'}
              value={values.contact.website}
              onChange={(event) =>
                update({
                  contact: { ...values.contact, website: event.target.value },
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Interests</CardTitle>
        </CardHeader>
        <CardContent className={'flex flex-col gap-4'}>
          <StringListEditor
            label={'Interested in'}
            items={values.interested}
            onChange={(next) => update({ interested: next })}
          />
          <StringListEditor
            label={'Not interested in'}
            items={values.not_interested}
            onChange={(next) => update({ not_interested: next })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sensitive details</CardTitle>
        </CardHeader>
        <CardContent className={'flex flex-col gap-4'}>
          <div className={'flex items-center gap-2'}>
            <Checkbox
              id={'include-sensitive'}
              checked={values.include_sensitive}
              onCheckedChange={(checked) =>
                update({ include_sensitive: checked === true })
              }
            />
            <Label htmlFor={'include-sensitive'}>
              Include sensitive details in the shared profile
            </Label>
          </div>
          {values.include_sensitive ? (
            <>
              <div className={'flex flex-col gap-2'}>
                <Label htmlFor={'credit-score'}>Credit score</Label>
                <Input
                  id={'credit-score'}
                  value={values.sensitive.credit_score}
                  onChange={(event) =>
                    update({
                      sensitive: {
                        ...values.sensitive,
                        credit_score: event.target.value,
                      },
                    })
                  }
                />
              </div>
              <div className={'flex flex-col gap-2'}>
                <Label htmlFor={'pre-approval'}>Pre-approval</Label>
                <Input
                  id={'pre-approval'}
                  value={values.sensitive.pre_approval}
                  onChange={(event) =>
                    update({
                      sensitive: {
                        ...values.sensitive,
                        pre_approval: event.target.value,
                      },
                    })
                  }
                />
              </div>
              <div className={'flex flex-col gap-2'}>
                <Label htmlFor={'sensitive-phone'}>Phone</Label>
                <Input
                  id={'sensitive-phone'}
                  value={values.sensitive.phone}
                  onChange={(event) =>
                    update({
                      sensitive: {
                        ...values.sensitive,
                        phone: event.target.value,
                      },
                    })
                  }
                />
              </div>
            </>
          ) : null}
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
