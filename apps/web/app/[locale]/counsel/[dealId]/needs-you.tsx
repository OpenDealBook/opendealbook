import type { ReactNode } from 'react';

import Link from 'next/link';

import { counselPortalPath } from '@odb/deal-counsel/entry-rules.ts';
import {
  FIXED_MILESTONES,
  type MilestoneKind,
} from '@odb/deal-timeline/schema.ts';

import type { OpenReview } from '../../home/_lib/counsel-deals';

interface TeamMessage {
  id: string;
  author_name: string;
  body: string;
  created_at: string;
}

interface RoomActivity {
  id: string;
  what: string;
  at: string;
}

interface SharedMilestone {
  kind: MilestoneKind;
  label: string | null;
  target_on: string | null;
  actual_on: string | null;
}

interface UpcomingDate {
  label: string;
  on: string;
}

function day(timestamp: string) {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function upcomingDates(
  milestones: SharedMilestone[],
  today: string,
): UpcomingDate[] {
  return milestones
    .filter(
      (milestone) =>
        milestone.actual_on === null &&
        milestone.target_on !== null &&
        milestone.target_on >= today,
    )
    .map((milestone) => ({
      label:
        milestone.kind === 'custom'
          ? milestone.label!
          : FIXED_MILESTONES[milestone.kind].label,
      on: milestone.target_on!,
    }))
    .sort((a, b) => a.on.localeCompare(b.on));
}

export function NeedsYou({
  dealId,
  reviews,
  messages,
  roomActivity,
  dates,
}: {
  dealId: string;
  reviews: OpenReview[];
  messages: TeamMessage[];
  roomActivity: RoomActivity[];
  dates: UpcomingDate[];
}) {
  const portal = counselPortalPath(dealId);
  const empty =
    reviews.length === 0 &&
    messages.length === 0 &&
    roomActivity.length === 0 &&
    dates.length === 0;

  return (
    <section className={'flex flex-col gap-4'}>
      <h2 className={'font-serif text-2xl font-medium'}>What needs you</h2>

      {empty ? (
        <p className={'text-muted-foreground'}>Nothing needs you right now.</p>
      ) : (
        <div className={'flex flex-col divide-y rounded-md border'}>
          {reviews.length > 0 ? (
            <Group
              title={'Reviews requested'}
              href={`${portal}/contracts`}
              linkLabel={'Open contracts'}
            >
              {reviews.map((review) => (
                <li key={`${review.contract}-${review.version}`}>
                  <span className={'font-medium'}>
                    {review.contract} version {review.version}
                  </span>
                  <span className={'text-muted-foreground block text-sm'}>
                    Review requested by {review.requestedBy} on{' '}
                    {day(review.requestedAt)}
                  </span>
                </li>
              ))}
            </Group>
          ) : null}

          {messages.length > 0 ? (
            <Group
              title={'Messages from the deal team'}
              href={`${portal}/messages`}
              linkLabel={'Open messages'}
            >
              {messages.map((message) => (
                <li key={message.id}>
                  <span className={'font-medium'}>{message.author_name}</span>
                  <span className={'text-muted-foreground text-sm'}>
                    {' '}
                    on {day(message.created_at)}
                  </span>
                  <span className={'line-clamp-2 block text-sm'}>
                    {message.body}
                  </span>
                </li>
              ))}
            </Group>
          ) : null}

          {roomActivity.length > 0 ? (
            <Group
              title={'New in the seller room'}
              href={`${portal}/seller-room`}
              linkLabel={'Open the seller room'}
            >
              {roomActivity.map((item) => (
                <li key={item.id}>
                  <span className={'line-clamp-2 block'}>{item.what}</span>
                  <span className={'text-muted-foreground text-sm'}>
                    {day(item.at)}
                  </span>
                </li>
              ))}
            </Group>
          ) : null}

          {dates.length > 0 ? (
            <Group title={'Coming up'}>
              {dates.map((date) => (
                <li key={`${date.label}-${date.on}`}>
                  <span className={'font-medium'}>{date.label}</span>
                  <span className={'text-muted-foreground text-sm'}>
                    {' '}
                    on {day(`${date.on}T00:00:00Z`)}
                  </span>
                </li>
              ))}
            </Group>
          ) : null}
        </div>
      )}
    </section>
  );
}

function Group({
  title,
  href,
  linkLabel,
  children,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className={'flex flex-col gap-3 p-4'}>
      <div className={'flex items-baseline justify-between gap-4'}>
        <h3 className={'font-semibold'}>{title}</h3>
        {href ? (
          <Link
            href={href}
            className={'text-primary text-sm font-medium hover:underline'}
          >
            {linkLabel}
          </Link>
        ) : null}
      </div>
      <ul className={'flex flex-col gap-3'}>{children}</ul>
    </div>
  );
}
