export function awaitsUnknownSend(
  enrollment: { id: string; status: string; current_step: number },
  unknownSends: { enrollment_id: string; step_id: number }[],
): boolean {
  return (
    ['queued', 'held'].includes(enrollment.status) &&
    unknownSends.some(
      (send) => send.enrollment_id === enrollment.id && send.step_id === enrollment.current_step,
    )
  );
}
