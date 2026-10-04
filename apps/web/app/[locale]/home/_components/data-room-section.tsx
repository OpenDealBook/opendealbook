import {
  fetchDocuments,
  fetchFolders,
  groupDocumentsByFolder,
} from '@odb/data-room';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Alert, AlertDescription, AlertTitle } from '@odb/ui/alert';
import { Badge } from '@odb/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import { DataRoomDocumentLink } from './data-room-document-link';

function dateOrNotSet(value: string | null): string {
  return value === null ? 'Not set' : new Date(value).toLocaleDateString('en-US');
}

export async function DataRoomSection({ dealId }: { dealId: string }) {
  const client = getSupabaseServerClient();

  const [folders, documents] = await Promise.all([
    fetchFolders(client, dealId),
    fetchDocuments(client, dealId),
  ]);

  const groups = groupDocumentsByFolder(folders, documents);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data room</CardTitle>
      </CardHeader>
      <CardContent className={'flex flex-col gap-6'}>
        <Alert>
          <AlertTitle>Opening documents needs storage provisioning</AlertTitle>
          <AlertDescription>
            The data-room storage bucket is not declared in the database schema
            yet, so Open stays unavailable until that bucket and its object
            policies exist.
          </AlertDescription>
        </Alert>

        {groups.length === 0 ? (
          <p className={'text-muted-foreground text-sm'}>
            No folders in this data room yet
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.folderId} className={'flex flex-col gap-2'}>
              <h4 className={'text-sm font-medium'}>{group.path}</h4>
              {group.documents.length === 0 ? (
                <p className={'text-muted-foreground text-sm'}>No documents</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.documents.map((document) => (
                      <TableRow key={document.id}>
                        <TableCell>{document.name}</TableCell>
                        <TableCell>
                          <Badge variant={'outline'}>{document.type}</Badge>
                        </TableCell>
                        <TableCell>v{document.version}</TableCell>
                        <TableCell>{dateOrNotSet(document.uploadedAt)}</TableCell>
                        <TableCell>
                          <DataRoomDocumentLink
                            dealId={dealId}
                            documentId={document.id}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
