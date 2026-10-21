'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useFieldArray, useForm } from 'react-hook-form';

import { hasPermission, type AppPermission } from '@odb/policies';
import { Button } from '@odb/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@odb/ui/form';
import { Input } from '@odb/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';

import { teamInvitationsQueryKey } from '../../hooks/use-team-invitations';
import { ROLE_LABELS } from '../../role-labels';
import {
  INVITABLE_ROLES,
  inviteMembersSchema,
  type InviteMembersData,
} from '../../schema/invite-members.schema';
import { inviteMembersAction } from '../../server/invitations-actions';

export function InviteMemberForm(props: {
  slug: string;
  accountId: string;
  permissions: AppPermission[];
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<InviteMembersData>({
    resolver: zodResolver(inviteMembersSchema),
    defaultValues: {
      slug: props.slug,
      invitations: [{ email: '', role: 'member' }],
    },
  });

  const fieldArray = useFieldArray({
    control: form.control,
    name: 'invitations',
  });

  if (!hasPermission(props.permissions, 'invites.manage')) {
    return null;
  }

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={form.handleSubmit(async (values) => {
          await inviteMembersAction(values);
          form.reset();
          await queryClient.invalidateQueries({
            queryKey: teamInvitationsQueryKey(props.accountId),
          });
          props.onSuccess?.();
        })}
      >
        {fieldArray.fields.map((entry, index) => (
          <div key={entry.id} className="flex gap-2">
            <FormField
              control={form.control}
              name={`invitations.${index}.email`}
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormControl>
                    <Input placeholder="Email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name={`invitations.${index}.role`}
              render={({ field }) => (
                <FormItem>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {INVITABLE_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="button"
              variant="ghost"
              onClick={() => fieldArray.remove(index)}
            >
              Remove
            </Button>
          </div>
        ))}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              fieldArray.append({
                email: '',
                role: 'member',
              })
            }
          >
            Add another
          </Button>

          <Button type="submit" disabled={form.formState.isSubmitting}>
            Send invitations
          </Button>
        </div>
      </form>
    </Form>
  );
}
