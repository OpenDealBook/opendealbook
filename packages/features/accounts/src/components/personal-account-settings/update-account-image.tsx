'use client';

import type { ChangeEvent } from 'react';

import { useMutation } from '@tanstack/react-query';

import { useSupabase } from '@tuckin/supabase/hooks';
import { Alert, AlertDescription, AlertTitle } from '@tuckin/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@tuckin/ui/avatar';
import { Input } from '@tuckin/ui/input';

import { useRevalidatePersonalAccountData } from '../../hooks/use-revalidate-personal-account-data';

const AVATAR_BUCKET = 'account_image';

export function UpdateAccountImage({
  userId,
  pictureUrl,
}: {
  userId: string;
  pictureUrl: string | null;
}) {
  const client = useSupabase();
  const revalidate = useRevalidatePersonalAccountData();

  const mutation = useMutation({
    mutationFn: async (file: File) => {
      const bucket = client.storage.from(AVATAR_BUCKET);
      const bytes = await file.arrayBuffer();

      const { error: uploadError } = await bucket.upload(userId, bytes, {
        contentType: file.type,
        upsert: true,
      });

      if (uploadError) {
        throw uploadError;
      }

      const publicUrl = bucket.getPublicUrl(userId).data.publicUrl;
      const nextUrl = `${publicUrl}?v=${Date.now()}`;

      await client
        .from('accounts')
        .update({ picture_url: nextUrl })
        .eq('id', userId)
        .throwOnError();
    },
    onSuccess: () => revalidate(userId),
  });

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      mutation.mutate(file);
    }
  };

  return (
    <div className="flex flex-col space-y-4">
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          <AvatarImage src={pictureUrl ?? undefined} />
          <AvatarFallback>?</AvatarFallback>
        </Avatar>

        <Input
          type="file"
          accept="image/*"
          className="max-w-xs"
          onChange={onChange}
          disabled={mutation.isPending}
        />
      </div>

      {mutation.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Upload failed</AlertTitle>
          <AlertDescription>
            Your picture could not be updated.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
