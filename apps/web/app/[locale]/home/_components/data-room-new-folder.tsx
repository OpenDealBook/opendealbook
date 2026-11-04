'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { useTranslations } from 'next-intl';

import { Button } from '@odb/ui/button';
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

import { createDataRoomFolder } from './data-room-folder-action';

const TOP_LEVEL = 'top';

export function DataRoomNewFolder({
  dealId,
  folders,
}: {
  dealId: string;
  folders: { id: string; name: string }[];
}) {
  const t = useTranslations('dataRoom.newFolder');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [parentId, setParentId] = useState(TOP_LEVEL);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [isCreating, startCreating] = useTransition();

  function onCreate(form: FormData) {
    startCreating(async () => {
      const created = await createDataRoomFolder({
        dealId,
        parentId: parentId === TOP_LEVEL ? null : parentId,
        name: String(form.get('name')),
      });

      if (!created.ok) {
        setRefusal(created.refusal);
        return;
      }

      setRefusal(null);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type={'button'}
        variant={'outline'}
        size={'sm'}
        onClick={() => setOpen(true)}
      >
        {t('open')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={'sm:max-w-sm'} aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
          </DialogHeader>
          <form className={'flex flex-col gap-3'} action={onCreate}>
            <Label htmlFor={'data-room-folder-name'}>{t('name')}</Label>
            <Input
              id={'data-room-folder-name'}
              name={'name'}
              required
              autoComplete={'off'}
            />
            {folders.length > 0 ? (
              <>
                <Label htmlFor={'data-room-folder-parent'}>{t('parent')}</Label>
                <Select value={parentId} onValueChange={setParentId}>
                  <SelectTrigger id={'data-room-folder-parent'}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TOP_LEVEL}>{t('topLevel')}</SelectItem>
                    {folders.map((folder) => (
                      <SelectItem key={folder.id} value={folder.id}>
                        {folder.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : null}
            {refusal ? (
              <p role={'alert'} className={'text-destructive text-sm'}>
                {refusal}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type={'button'}
                variant={'outline'}
                onClick={() => setOpen(false)}
              >
                {t('cancel')}
              </Button>
              <Button type={'submit'} disabled={isCreating}>
                {t('create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
