'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { Button } from '@odb/ui/button';
import { Checkbox } from '@odb/ui/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@odb/ui/form';

import {
  termsStepSchema,
  type TermsStep,
} from '../../schema/onboarding.schema';

export function TermsStepForm(props: {
  value?: TermsStep;
  onSubmit: (value: TermsStep) => void;
  onBack?: () => void;
}) {
  const form = useForm({
    resolver: zodResolver(termsStepSchema),
    defaultValues: {
      acceptedTerms: props.value?.acceptedTerms ?? false,
      compPoolOptin: props.value?.compPoolOptin ?? false,
    },
  });

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit((values) =>
          props.onSubmit(termsStepSchema.parse(values)),
        )}
      >
        <FormField
          control={form.control}
          name="acceptedTerms"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center gap-2">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                </FormControl>
                <FormLabel>I accept the hosted terms of service</FormLabel>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="compPoolOptin"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center gap-2">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                </FormControl>
                <FormLabel>
                  Contribute anonymized deal data to the comparables pool
                </FormLabel>
              </div>
              <FormDescription>
                Helps improve valuation comparables across the platform.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-2">
          {props.onBack ? (
            <Button type="button" variant="ghost" onClick={props.onBack}>
              Back
            </Button>
          ) : null}
          <Button type="submit">Continue</Button>
        </div>
      </form>
    </Form>
  );
}
