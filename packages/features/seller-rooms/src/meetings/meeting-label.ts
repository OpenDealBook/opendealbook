const KIND: Record<string, string> = {
  weekly: 'Weekly meeting',
  site_visit: 'Site visit',
};

export function meetingLabel(meeting: {
  type: string;
  scheduled_at: string | null;
}): string {
  const kind = KIND[meeting.type] ?? meeting.type;

  return meeting.scheduled_at
    ? `${kind}, ${new Date(meeting.scheduled_at).toLocaleDateString('en-US', {
        dateStyle: 'medium',
        timeZone: 'UTC',
      })}`
    : kind;
}
