export function ViewingAsLender({ lenderName }: { lenderName: string | null }) {
  return (
    <p
      className={
        'border-brass/50 bg-brass/15 rounded-md border px-3 py-2 text-sm'
      }
    >
      You are viewing this room as {lenderName} sees it.
    </p>
  );
}
