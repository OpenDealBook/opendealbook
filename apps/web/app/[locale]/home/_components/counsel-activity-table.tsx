import type { CounselActivityEntry } from '@odb/deal-counsel/documents.ts';
import { LocalTime } from '@odb/lender-rooms/requests-ui/local-time.tsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

const actionWording = {
  document_previewed: 'Previewed',
  document_downloaded: 'Downloaded',
} satisfies Record<CounselActivityEntry['action'], string>;

export function CounselActivityTable({
  entries,
}: {
  entries: CounselActivityEntry[];
}) {
  if (entries.length === 0) {
    return (
      <p className={'text-muted-foreground text-sm'}>
        {"Buyer's counsel have not opened any files yet."}
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Counsel</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>File</TableHead>
          <TableHead>When</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell>{entry.person}</TableCell>
            <TableCell>{actionWording[entry.action]}</TableCell>
            <TableCell>{entry.file}</TableCell>
            <TableCell>
              <LocalTime at={entry.at} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
