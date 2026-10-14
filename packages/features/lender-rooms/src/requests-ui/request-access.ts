export function requestIsInRoom(
  found: { room_id: string } | null,
  roomId: string,
): boolean {
  return found?.room_id === roomId;
}

export function newestSignature<
  Signature extends { created_at: string; status: string },
>(signatures: Signature[]): Signature | undefined {
  const [newest] = signatures.toSorted(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );

  return newest?.status === 'cancelled' ? undefined : newest;
}
