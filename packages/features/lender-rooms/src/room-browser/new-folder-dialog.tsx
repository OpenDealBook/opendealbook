'use client';

import { useRouter } from 'next/navigation';

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

import { ProblemNote } from '../requests-ui/refusal-note';
import { useAttempt } from '../requests-ui/use-attempt';
import { createFolder } from '../uploads/folder-actions';
import type { SpaceTarget } from '../uploads/targets';

export function NewFolderDialog({
  space,
  parentFolderId,
  signInPath,
  onClose,
}: {
  space: SpaceTarget;
  parentFolderId: string;
  signInPath?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { problem, isPending, attempt } = useAttempt();

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className={'sm:max-w-sm'} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>
        </DialogHeader>
        <form
          className={'flex flex-col gap-3'}
          action={(form) =>
            attempt(
              () =>
                createFolder({
                  ...space,
                  parentFolderId,
                  name: String(form.get('name')),
                }),
              () => {
                router.refresh();
                onClose();
              },
            )
          }
        >
          <Label htmlFor={'new-folder-name'}>Folder name</Label>
          <Input
            id={'new-folder-name'}
            name={'name'}
            required
            autoComplete={'off'}
          />
          <ProblemNote problem={problem} signInPath={signInPath} />
          <DialogFooter>
            <Button type={'button'} variant={'outline'} onClick={onClose}>
              Cancel
            </Button>
            <Button type={'submit'} disabled={isPending}>
              Create folder
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
