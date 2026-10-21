export interface NudgeFacts {
  contactName: string;
  ourName: string;
  deals: { dealName: string; daysSilent: number }[];
}

export function draftNudge({ contactName, ourName, deals }: NudgeFacts) {
  const quiet = deals
    .map(
      ({ dealName, daysSilent }) =>
        `${dealName}, ${daysSilent} ${daysSilent === 1 ? 'day' : 'days'}`,
    )
    .join('; ');

  return [
    `Hi ${contactName},`,
    '',
    "Checking in on these deals. Here is how long it's been since we last heard from you:",
    quiet,
    '',
    'Any update you can share would help us plan.',
    '',
    'Thanks,',
    ourName,
  ].join('\n');
}
