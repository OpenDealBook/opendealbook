'use client';

import { useSignOut } from '@tuckin/auth';
import { Avatar, AvatarFallback } from '@tuckin/ui/avatar';
import { Button } from '@tuckin/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuckin/ui/dropdown-menu';

export function AccountDropdown({ email }: { email: string }) {
  const signOut = useSignOut();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={'ghost'} className={'h-9 w-9 rounded-full p-0'}>
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

        <DropdownMenuItem onClick={() => void signOut()}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
