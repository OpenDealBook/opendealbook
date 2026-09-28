import type { Database } from '@odb/supabase';

type PublicTables = Database['public']['Tables'];

export type TableChangeType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface RecordChange<Table extends keyof PublicTables> {
  type: TableChangeType;
  table: Table;
  schema: 'public';
  record: PublicTables[Table]['Row'];
  old_record: PublicTables[Table]['Row'] | null;
}

export type AnyRecordChange = {
  [Table in keyof PublicTables]: RecordChange<Table>;
}[keyof PublicTables];
