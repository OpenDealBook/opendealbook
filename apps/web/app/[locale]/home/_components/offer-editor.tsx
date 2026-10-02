'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { fundingSourceTypeSchema } from '@odb/calculators';
import {
  contingencyTypeSchema,
  inventoryTreatmentSchema,
  offerTermsSchema,
  type OfferAuthorSide,
  type OfferTerms,
  type OfferVersion,
} from '@odb/deals';
import {
  addOfferVersion,
  createOffer,
  acceptOffer,
  expireOffer,
  rejectOffer,
  submitOffer,
  withdrawOffer,
} from '@odb/deals/server';
import { Button } from '@odb/ui/button';
import { Checkbox } from '@odb/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@odb/ui/dialog';
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

const INVENTORY_UNSET = 'none';

interface FundingRow {
  type: string;
  amount: string;
  rate: string;
  term_years: string;
  standby_months: string;
}

interface EditorState {
  purchase_price: string;
  real_estate_portion: string;
  inventory_treatment: string;
  cash_at_close: string;
  earnout_amount: string;
  earnout_months: string;
  earnout_metric: string;
  funding: FundingRow[];
  earnest_amount: string;
  earnest_due_days: string;
  exclusivity_days: string;
  diligence_days: string;
  target_close_date: string;
  offer_expires_at: string;
  contingencies: string[];
  non_compete_years: string;
  non_compete_radius: string;
  non_compete_scope: string;
  training_length: string;
  training_paid: boolean;
}

function emptyState(): EditorState {
  return {
    purchase_price: '',
    real_estate_portion: '',
    inventory_treatment: INVENTORY_UNSET,
    cash_at_close: '',
    earnout_amount: '',
    earnout_months: '',
    earnout_metric: '',
    funding: [],
    earnest_amount: '',
    earnest_due_days: '',
    exclusivity_days: '',
    diligence_days: '',
    target_close_date: '',
    offer_expires_at: '',
    contingencies: [],
    non_compete_years: '',
    non_compete_radius: '',
    non_compete_scope: '',
    training_length: '',
    training_paid: false,
  };
}

function num(value: string): number | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : Number(trimmed);
}

function buildTerms(state: EditorState): unknown {
  const terms: Record<string, unknown> = {
    purchase_price: num(state.purchase_price),
    real_estate_portion: num(state.real_estate_portion),
    cash_at_close: num(state.cash_at_close),
    exclusivity_days: num(state.exclusivity_days),
    diligence_days: num(state.diligence_days),
  };

  if (state.inventory_treatment !== INVENTORY_UNSET) {
    terms.inventory_treatment = state.inventory_treatment;
  }
  if (state.target_close_date !== '') {
    terms.target_close_date = state.target_close_date;
  }
  if (state.offer_expires_at !== '') {
    terms.offer_expires_at = new Date(state.offer_expires_at).toISOString();
  }
  if (state.earnout_amount.trim() !== '') {
    terms.earnout = {
      amount: Number(state.earnout_amount),
      months: num(state.earnout_months) ?? 0,
      metric: state.earnout_metric,
      targets: [],
    };
  }
  if (state.funding.length > 0) {
    terms.funding_sources = state.funding.map((row) => ({
      type: row.type,
      amount: num(row.amount),
      rate: num(row.rate),
      term_years: num(row.term_years),
      standby_months: num(row.standby_months),
    }));
  }
  if (state.earnest_amount.trim() !== '') {
    terms.earnest_deposit = {
      amount: Number(state.earnest_amount),
      due_days: num(state.earnest_due_days) ?? 0,
    };
  }
  if (state.contingencies.length > 0) {
    terms.contingencies = state.contingencies.map((type) => ({ type }));
  }
  if (state.non_compete_years.trim() !== '') {
    terms.non_compete = {
      years: Number(state.non_compete_years),
      radius: state.non_compete_radius,
      scope: state.non_compete_scope,
    };
  }
  if (state.training_length.trim() !== '') {
    terms.training_period = {
      length: state.training_length,
      paid: state.training_paid,
    };
  }

  return terms;
}

function versionFromTerms(
  terms: OfferTerms,
  authorSide: OfferAuthorSide,
  number: number,
): OfferVersion {
  return {
    number,
    author_side: authorSide,
    purchase_price: terms.purchase_price,
    real_estate_portion: terms.real_estate_portion,
    target_close_date: terms.target_close_date,
    offer_expires_at: terms.offer_expires_at,
    exclusivity_days: terms.exclusivity_days,
    diligence_days: terms.diligence_days,
    terms,
  };
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={'flex flex-col gap-2'}>
      <h4 className={'text-sm font-medium'}>{title}</h4>
      <div className={'grid grid-cols-2 gap-3'}>{children}</div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={'flex flex-col gap-1'}>
      <Label className={'text-xs'}>{label}</Label>
      <Input
        type={'number'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={'flex flex-col gap-1'}>
      <Label className={'text-xs'}>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function OfferEditorDialog({
  triggerLabel,
  triggerVariant,
  title,
  dealId,
  offerId,
  authorSide,
  number,
}: {
  triggerLabel: string;
  triggerVariant?: 'default' | 'outline';
  title: string;
  dealId: string;
  offerId: string | null;
  authorSide: OfferAuthorSide;
  number: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<EditorState>(emptyState);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof EditorState>(key: K, value: EditorState[K]) {
    setState((previous) => ({ ...previous, [key]: value }));
  }

  function setFunding(index: number, key: keyof FundingRow, value: string) {
    setState((previous) => ({
      ...previous,
      funding: previous.funding.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row,
      ),
    }));
  }

  function addFunding() {
    setState((previous) => ({
      ...previous,
      funding: [
        ...previous.funding,
        {
          type: 'conventional',
          amount: '',
          rate: '',
          term_years: '',
          standby_months: '',
        },
      ],
    }));
  }

  function removeFunding(index: number) {
    setState((previous) => ({
      ...previous,
      funding: previous.funding.filter((_, rowIndex) => rowIndex !== index),
    }));
  }

  function toggleContingency(type: string, checked: boolean) {
    setState((previous) => ({
      ...previous,
      contingencies: checked
        ? [...previous.contingencies, type]
        : previous.contingencies.filter((value) => value !== type),
    }));
  }

  function submit() {
    const parsed = offerTermsSchema.safeParse(buildTerms(state));

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid offer terms');
      return;
    }

    const version = versionFromTerms(parsed.data, authorSide, number);

    startTransition(async () => {
      if (offerId) {
        await addOfferVersion({
          offer_id: offerId,
          author_side: authorSide,
          version,
        });
      } else {
        await createOffer({ deal_id: dealId, first_version: version });
      }
      setOpen(false);
      setState(emptyState());
      setError(null);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant={triggerVariant ?? 'outline'}
        size={'sm'}
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={'max-h-[85vh] overflow-y-auto sm:max-w-2xl'}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          <div className={'flex flex-col gap-5'}>
            <Section title={'Price'}>
              <NumberField
                label={'Purchase price (required)'}
                value={state.purchase_price}
                onChange={(value) => set('purchase_price', value)}
              />
              <NumberField
                label={'Real estate portion'}
                value={state.real_estate_portion}
                onChange={(value) => set('real_estate_portion', value)}
              />
              <div className={'flex flex-col gap-1'}>
                <Label className={'text-xs'}>Inventory treatment</Label>
                <Select
                  value={state.inventory_treatment}
                  onValueChange={(value) => set('inventory_treatment', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={INVENTORY_UNSET}>Not set</SelectItem>
                    {inventoryTreatmentSchema.options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Section>

            <Section title={'Structure'}>
              <NumberField
                label={'Cash at close'}
                value={state.cash_at_close}
                onChange={(value) => set('cash_at_close', value)}
              />
              <NumberField
                label={'Earnout amount'}
                value={state.earnout_amount}
                onChange={(value) => set('earnout_amount', value)}
              />
              <NumberField
                label={'Earnout months'}
                value={state.earnout_months}
                onChange={(value) => set('earnout_months', value)}
              />
              <TextField
                label={'Earnout metric'}
                value={state.earnout_metric}
                onChange={(value) => set('earnout_metric', value)}
              />
            </Section>

            <div className={'flex flex-col gap-2'}>
              <div className={'flex items-center justify-between'}>
                <h4 className={'text-sm font-medium'}>Financing</h4>
                <Button variant={'outline'} size={'sm'} onClick={addFunding}>
                  Add source
                </Button>
              </div>
              {state.funding.map((row, index) => (
                <div
                  key={index}
                  className={'grid grid-cols-6 items-end gap-2'}
                >
                  <div className={'col-span-2 flex flex-col gap-1'}>
                    <Label className={'text-xs'}>Type</Label>
                    <Select
                      value={row.type}
                      onValueChange={(value) => setFunding(index, 'type', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {fundingSourceTypeSchema.options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option.replace(/_/g, ' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className={'flex flex-col gap-1'}>
                    <Label className={'text-xs'}>Amount</Label>
                    <Input
                      type={'number'}
                      value={row.amount}
                      onChange={(event) =>
                        setFunding(index, 'amount', event.target.value)
                      }
                    />
                  </div>
                  <div className={'flex flex-col gap-1'}>
                    <Label className={'text-xs'}>Rate (whole %)</Label>
                    <Input
                      type={'number'}
                      value={row.rate}
                      onChange={(event) =>
                        setFunding(index, 'rate', event.target.value)
                      }
                    />
                  </div>
                  <div className={'flex flex-col gap-1'}>
                    <Label className={'text-xs'}>Term yrs</Label>
                    <Input
                      type={'number'}
                      value={row.term_years}
                      onChange={(event) =>
                        setFunding(index, 'term_years', event.target.value)
                      }
                    />
                  </div>
                  <div className={'flex items-end gap-1'}>
                    <div className={'flex flex-col gap-1'}>
                      <Label className={'text-xs'}>Standby mo</Label>
                      <Input
                        type={'number'}
                        value={row.standby_months}
                        onChange={(event) =>
                          setFunding(index, 'standby_months', event.target.value)
                        }
                      />
                    </div>
                    <Button
                      variant={'outline'}
                      size={'sm'}
                      onClick={() => removeFunding(index)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <Section title={'Deposits'}>
              <NumberField
                label={'Earnest deposit'}
                value={state.earnest_amount}
                onChange={(value) => set('earnest_amount', value)}
              />
              <NumberField
                label={'Earnest due (days)'}
                value={state.earnest_due_days}
                onChange={(value) => set('earnest_due_days', value)}
              />
            </Section>

            <Section title={'Timing'}>
              <NumberField
                label={'Exclusivity (days)'}
                value={state.exclusivity_days}
                onChange={(value) => set('exclusivity_days', value)}
              />
              <NumberField
                label={'Diligence (days)'}
                value={state.diligence_days}
                onChange={(value) => set('diligence_days', value)}
              />
              <div className={'flex flex-col gap-1'}>
                <Label className={'text-xs'}>Target close date</Label>
                <Input
                  type={'date'}
                  value={state.target_close_date}
                  onChange={(event) =>
                    set('target_close_date', event.target.value)
                  }
                />
              </div>
              <div className={'flex flex-col gap-1'}>
                <Label className={'text-xs'}>Offer expires at</Label>
                <Input
                  type={'datetime-local'}
                  value={state.offer_expires_at}
                  onChange={(event) =>
                    set('offer_expires_at', event.target.value)
                  }
                />
              </div>
            </Section>

            <div className={'flex flex-col gap-2'}>
              <h4 className={'text-sm font-medium'}>Contingencies</h4>
              <div className={'grid grid-cols-2 gap-2'}>
                {contingencyTypeSchema.options.map((option) => (
                  <label
                    key={option}
                    className={'flex items-center gap-2 text-sm'}
                  >
                    <Checkbox
                      checked={state.contingencies.includes(option)}
                      onCheckedChange={(checked) =>
                        toggleContingency(option, checked === true)
                      }
                    />
                    {option.replace(/_/g, ' ')}
                  </label>
                ))}
              </div>
            </div>

            <Section title={'Seller'}>
              <NumberField
                label={'Non-compete years'}
                value={state.non_compete_years}
                onChange={(value) => set('non_compete_years', value)}
              />
              <TextField
                label={'Non-compete radius'}
                value={state.non_compete_radius}
                onChange={(value) => set('non_compete_radius', value)}
              />
              <TextField
                label={'Non-compete scope'}
                value={state.non_compete_scope}
                onChange={(value) => set('non_compete_scope', value)}
              />
              <div className={'flex flex-col gap-1'}>
                <Label className={'text-xs'}>Training period</Label>
                <Input
                  value={state.training_length}
                  onChange={(event) =>
                    set('training_length', event.target.value)
                  }
                  placeholder={'e.g. 4 weeks'}
                />
                <label className={'flex items-center gap-2 text-sm'}>
                  <Checkbox
                    checked={state.training_paid}
                    onCheckedChange={(checked) =>
                      set('training_paid', checked === true)
                    }
                  />
                  Paid
                </label>
              </div>
            </Section>

            {error === null ? null : (
              <p className={'text-destructive text-sm'}>{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant={'outline'}
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              Save version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CreateOfferButton({ dealId }: { dealId: string }) {
  return (
    <OfferEditorDialog
      triggerLabel={'Create offer'}
      triggerVariant={'default'}
      title={'Create offer'}
      dealId={dealId}
      offerId={null}
      authorSide={'buyer'}
      number={1}
    />
  );
}

const TERMINAL_OFFER_STATUSES = [
  'accepted',
  'rejected',
  'withdrawn',
  'expired',
];

export function OfferLifecycleActions({
  offerId,
  status,
  dealId,
  nextNumber,
}: {
  offerId: string;
  status: string;
  dealId: string;
  nextNumber: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (TERMINAL_OFFER_STATUSES.includes(status)) {
    return null;
  }

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  return (
    <div className={'flex flex-wrap items-center gap-2'}>
      <OfferEditorDialog
        triggerLabel={'Add buyer revision'}
        title={'Add buyer revision'}
        dealId={dealId}
        offerId={offerId}
        authorSide={'buyer'}
        number={nextNumber}
      />
      <OfferEditorDialog
        triggerLabel={'Record seller counter'}
        title={'Record seller counter'}
        dealId={dealId}
        offerId={offerId}
        authorSide={'seller'}
        number={nextNumber}
      />
      <Button
        variant={'outline'}
        size={'sm'}
        disabled={pending}
        onClick={() => run(() => submitOffer({ offer_id: offerId }))}
      >
        Submit
      </Button>
      <Button
        variant={'outline'}
        size={'sm'}
        disabled={pending}
        onClick={() => run(() => acceptOffer({ offer_id: offerId }))}
      >
        Accept
      </Button>
      <Button
        variant={'outline'}
        size={'sm'}
        disabled={pending}
        onClick={() => run(() => rejectOffer({ offer_id: offerId }))}
      >
        Reject
      </Button>
      <Button
        variant={'outline'}
        size={'sm'}
        disabled={pending}
        onClick={() => run(() => withdrawOffer({ offer_id: offerId }))}
      >
        Withdraw
      </Button>
      <Button
        variant={'outline'}
        size={'sm'}
        disabled={pending}
        onClick={() => run(() => expireOffer({ offer_id: offerId }))}
      >
        Expire
      </Button>
    </div>
  );
}
