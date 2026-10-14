'use client';

import { useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import {
  lookupLenderBrand,
  setManualLenderLogo,
} from '@odb/lender-rooms/brand/actions.ts';
import { ProblemNote } from '@odb/lender-rooms/requests-ui/refusal-note.tsx';
import { useAttempt } from '@odb/lender-rooms/requests-ui/use-attempt.ts';
import { createLenderRoom } from '@odb/lender-rooms/rooms/actions.ts';
import { Button } from '@odb/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@odb/ui/dialog';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';

import { LenderLogo } from './lender-mark';
import { teamSignInPath } from './lender-wording';

interface LookedUp {
  domain: string;
  logoUrl: string | null;
  foundAnything: boolean;
}

export function LenderCreateRoom({
  dealId,
  basePath,
  openLabel,
}: {
  dealId: string;
  basePath: string;
  openLabel: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [lookedUp, setLookedUp] = useState<LookedUp | null>(null);
  const [name, setName] = useState('');
  const [logo, setLogo] = useState<File | null>(null);
  const createdRoomId = useRef<string | null>(null);
  const looking = useAttempt();
  const creating = useAttempt();
  const awaitsLookup = url.trim() !== '' && lookedUp === null;

  function lookUp() {
    looking.attempt(
      async () => {
        const result = await lookupLenderBrand({ dealId, url });

        if (result.ok) {
          if (result.value?.name) {
            setName(result.value.name);
          }

          setLookedUp({
            domain: result.value?.domain ?? url,
            logoUrl: result.value?.logoUrl ?? null,
            foundAnything: result.value !== null,
          });
        }

        return result;
      },
      () => {},
    );
  }

  function create() {
    creating.attempt(
      async () => {
        if (createdRoomId.current === null) {
          const created = await createLenderRoom({
            dealId,
            name,
            ...(lookedUp ? { brandDomain: lookedUp.domain } : {}),
          });

          if (!created.ok) {
            return created;
          }

          createdRoomId.current = created.value;
        }

        const roomId = createdRoomId.current;

        const logoSet =
          lookedUp && logo
            ? await setManualLenderLogo({ dealId, roomId, file: logo })
            : null;

        return logoSet?.ok === false ? logoSet : { ok: true, value: roomId };
      },
      () => router.push(`${basePath}/${createdRoomId.current}?tab=people`),
    );
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>{openLabel}</Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a lender room</DialogTitle>
            <DialogDescription>
              Paste the lender&apos;s website and we will read their name and
              logo from it, or just type their name. The room stays open for 60
              days unless you change that.
            </DialogDescription>
          </DialogHeader>

          <form
            className={'flex flex-col gap-2'}
            onSubmit={(event) => {
              event.preventDefault();
              lookUp();
            }}
          >
            <Label htmlFor={'lender-website'}>
              Lender&apos;s website (optional)
            </Label>
            <div className={'flex gap-2'}>
              <Input
                id={'lender-website'}
                value={url}
                placeholder={'firstbank.com'}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setLookedUp(null);
                  setLogo(null);
                }}
                required
              />
              <Button
                type={'submit'}
                variant={'outline'}
                disabled={looking.isPending}
              >
                Look up
              </Button>
            </div>
            <ProblemNote
              problem={looking.problem}
              signInPath={teamSignInPath}
            />
          </form>

          <form
            className={'flex flex-col gap-4'}
            onSubmit={(event) => {
              event.preventDefault();
              create();
            }}
          >
            {lookedUp && !lookedUp.foundAnything ? (
              <p className={'text-muted-foreground text-sm'}>
                We could not read a name or logo from that website. Type the
                lender&apos;s name and the room will use their initials until a
                logo is added.
              </p>
            ) : null}
            <div className={'flex flex-col gap-2'}>
              <Label htmlFor={'lender-name'}>Lender name</Label>
              <Input
                id={'lender-name'}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>
            {lookedUp?.logoUrl ? (
              <p
                className={
                  'text-muted-foreground flex items-center gap-3 text-sm'
                }
              >
                <LenderLogo name={name} logoUrl={lookedUp.logoUrl} />
                We found their logo and will show it on the room.
              </p>
            ) : null}
            {lookedUp && !lookedUp.logoUrl ? (
              <div className={'flex flex-col gap-2'}>
                <Label htmlFor={'lender-logo'}>
                  Logo (optional, an image up to 512 KiB)
                </Label>
                <Input
                  id={'lender-logo'}
                  type={'file'}
                  accept={'image/*'}
                  onChange={(event) => setLogo(event.target.files?.[0] ?? null)}
                />
              </div>
            ) : null}
            {awaitsLookup ? (
              <p className={'text-muted-foreground text-sm'}>
                Look the website up first, or clear it to create the room from
                the name alone.
              </p>
            ) : null}
            <ProblemNote
              problem={creating.problem}
              signInPath={teamSignInPath}
            />
            <DialogFooter>
              <Button
                type={'button'}
                variant={'outline'}
                onClick={() => setIsOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type={'submit'}
                disabled={creating.isPending || awaitsLookup}
              >
                Create room
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
