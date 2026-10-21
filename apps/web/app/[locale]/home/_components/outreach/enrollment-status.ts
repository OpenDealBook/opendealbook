export function enrollmentStatusLabel(status: string): string {
  return status === 'held' ? 'Awaiting approval' : status;
}
