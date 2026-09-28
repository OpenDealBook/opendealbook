'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';

import { hasPermission, type AppPermission, type Role } from '@odb/policies';
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

import {
  inviteMembersSchema,
  type InviteMembersData,
} from '../../schema/invite-members.schema';
import { inviteMembersAction } from '../../server/invitations-actions';

export function InviteMemberForm(props: {
  slug: string;
  roles: Role[];
  permissions: AppPermission[];
  onSuccess?: () => void;
}) {
  const form = useForm<InviteMembersData>({
    resolver: zodResolver(inviteMembersSchema),
    defaultValues: {
      slug: props.slug,
      invitations: [{ email: '', role: props.roles[0]?.name ?? '' }],
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
                      {props.roles.map((role) => (
                        <SelectItem key={role.name} value={role.name}>
                          {role.name}
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
                role: props.roles[0]?.name ?? '',
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
