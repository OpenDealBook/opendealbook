'use client';

import { useId, useState } from 'react';

import Link from 'next/link';

import { Button } from '@odb/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@odb/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@odb/ui/sheet';

interface Team {
  id: string;
  name: string;
  slug: string | null;
}

interface NavGroup {
  heading: string;
  links: { label: string; path: string }[];
}

interface TeamNavigationProps {
  team: Team;
  teams: Team[];
  groups: NavGroup[];
}

function TeamSwitcher({
  team,
  teams,
  onNavigate,
}: {
  team: Team;
  teams: Team[];
  onNavigate?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={'outline'}
          aria-label={`${team.name}, switch team`}
          title={team.name}
          className={'w-full justify-start truncate'}
        >
          {team.name}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align={'start'} className={'w-56'}>
        {teams.map((entry) => (
          <DropdownMenuItem key={entry.id} asChild>
            <Link href={`/home/${entry.slug}`} onClick={onNavigate}>
              {entry.name}
            </Link>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href={'/home/create-team'} onClick={onNavigate}>
            Create team
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavGroupLinks({
  group,
  onNavigate,
}: {
  group: NavGroup;
  onNavigate?: () => void;
}) {
  const headingId = useId();

  return (
    <div role={'group'} aria-labelledby={headingId} className={'flex flex-col'}>
      <h2
        id={headingId}
        className={'text-muted-foreground px-3 pb-1 text-xs font-medium'}
      >
        {group.heading}
      </h2>

      {group.links.map((link) => (
        <Link
          key={link.path}
          href={link.path}
          onClick={onNavigate}
          className={'hover:bg-muted flex min-h-11 items-center rounded-md px-3 text-sm'}
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}

function TeamNavigation({
  team,
  teams,
  groups,
  onNavigate,
}: TeamNavigationProps & { onNavigate?: () => void }) {
  return (
    <>
      <TeamSwitcher team={team} teams={teams} onNavigate={onNavigate} />

      <nav aria-label={'Team'} className={'flex flex-col gap-6'}>
        {groups.map((group) => (
          <NavGroupLinks
            key={group.heading}
            group={group}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
    </>
  );
}

export function TeamSidebar(props: TeamNavigationProps) {
  return (
    <>
      <a
        href={'#main-content'}
        className={
          'bg-background sr-only rounded-md px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50'
        }
      >
        Skip to content
      </a>
      <aside
        className={'hidden w-64 shrink-0 flex-col gap-6 border-r p-4 lg:sticky lg:top-0 lg:flex lg:h-screen lg:overflow-y-auto'}
      >
        <TeamNavigation {...props} />
      </aside>
    </>
  );
}

export function TeamMenuButton(props: TeamNavigationProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant={'outline'} size={'sm'} className={'lg:hidden'}>
          Menu
        </Button>
      </SheetTrigger>

      <SheetContent
        side={'left'}
        aria-describedby={undefined}
        className={'w-72 gap-6 overflow-y-auto p-4 pt-12'}
      >
        <SheetTitle className={'sr-only'}>Menu</SheetTitle>
        <TeamNavigation {...props} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
