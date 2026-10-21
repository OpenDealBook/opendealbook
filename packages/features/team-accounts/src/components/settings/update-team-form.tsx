'use client';

import { useState, useSyncExternalStore } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { hasPermission, type AppPermission } from '@odb/policies';
import { Button } from '@odb/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@odb/ui/form';
import { Input } from '@odb/ui/input';

import {
  updateTeamSchema,
  type UpdateTeamData,
} from '../../schema/update-team.schema';
import { updateTeamAction } from '../../server/settings-actions';

export function UpdateTeamForm(props: {
  accountId: string;
  name: string;
  legalEntityName?: string;
  teamPhone?: string;
  slug: string;
  permissions: AppPermission[];
  locale: string;
  renameAllowedAt?: string;
}) {
  const form = useForm<UpdateTeamData>({
    resolver: zodResolver(updateTeamSchema),
    defaultValues: {
      accountId: props.accountId,
      name: props.name,
      legalEntityName: props.legalEntityName ?? '',
      teamPhone: props.teamPhone ?? '',
    },
  });
  const [renameAllowedAt, setRenameAllowedAt] = useState(props.renameAllowedAt);
  const [saved, setSaved] = useState(false);
  const renameLocked = renameAllowedAt !== undefined;
  // The server does not know the user's time zone, so the date renders only in
  // the browser.
  const inBrowser = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  const canManage = hasPermission(props.permissions, 'settings.manage');

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(async (values) => {
          const result = await updateTeamAction(values);

          if (!result.success) {
            setRenameAllowedAt(result.renameAllowedAt);
            return;
          }

          if (result.slug === props.slug) {
            setSaved(true);
            return;
          }

          window.location.assign(
            window.location.pathname.replace(
              `/home/${props.slug}`,
              `/home/${result.slug}`,
            ) + window.location.search,
          );
        })}
      >
        <fieldset disabled={!canManage} className="flex min-w-0 flex-col gap-4">
          {canManage ? null : (
            <legend className="text-muted-foreground mb-2 text-sm">
              Only team owners and admins can change team settings.
            </legend>
          )}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Team name</FormLabel>
                <FormControl>
                  <Input {...field} disabled={renameLocked} />
                </FormControl>
                <FormDescription>Slug: {props.slug}</FormDescription>
                <FormMessage />
                {renameLocked && inBrowser && (
                  <p role="alert" className="text-destructive text-sm">
                    You can rename again on{' '}
                    {new Intl.DateTimeFormat(props.locale, {
                      dateStyle: 'long',
                    }).format(new Date(renameAllowedAt))}
                  </p>
                )}
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="legalEntityName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Legal entity name</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormDescription>
                  The buying entity named in letters of intent and purchase
                  agreements.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="teamPhone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Team phone</FormLabel>
                <FormControl>
                  <Input type="tel" {...field} />
                </FormControl>
                <FormDescription>
                  Sellers see this when the deal owner has no phone of their
                  own.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            disabled={
              (renameLocked &&
                !form.formState.dirtyFields.legalEntityName &&
                !form.formState.dirtyFields.teamPhone) ||
              form.formState.isSubmitting
            }
          >
            Save changes
          </Button>
          {saved ? (
            <p role="status" className="text-sm">
              Saved
            </p>
          ) : null}
        </fieldset>
      </form>
    </Form>
  );
}

function subscribeToNothing() {
  return () => {};
}
