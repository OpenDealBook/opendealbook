'use client';

import Link from 'next/link';

import { useSignOut } from '@odb/auth';
import { Avatar, AvatarFallback } from '@odb/ui/avatar';
import { Button } from '@odb/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@odb/ui/dropdown-menu';

export function AccountDropdown({ email }: { email: string }) {
  const signOut = useSignOut();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={'ghost'}
          aria-label={`Account menu for ${email}`}
          className={'h-9 w-9 rounded-full p-0'}
        >
          <Avatar className={'h-9 w-9'}>
            <AvatarFallback>{email.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align={'end'} className={'w-56'}>
        <DropdownMenuLabel className={'truncate font-normal'}>
          {email}
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href={'/home/settings'}>Account settings</Link>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => void signOut()}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
