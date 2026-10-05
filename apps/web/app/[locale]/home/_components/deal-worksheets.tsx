'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { deleteWorksheetRow, saveWorksheetRow } from '@odb/deals/server';
import {
  WORKSHEET_FIELD_CATALOG,
  type DealWorksheetType,
  type WorksheetField,
  type WorksheetRowData,
} from '@odb/deals/shared';
import type { Tables } from '@odb/supabase';
import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';

import { worksheetColumns, worksheetDisplayCells } from './deal-worksheets-cells';

const WORKSHEET_TYPES: DealWorksheetType[] = [
  'margin_analysis',
  'retention_plan',
  'process_sop',
  'marketing_effectiveness',
];

const WORKSHEET_TITLES: Record<DealWorksheetType, string> = {
  margin_analysis: 'Margin analysis',
  retention_plan: 'Retention plan',
  process_sop: 'Process SOP',
  marketing_effectiveness: 'Marketing effectiveness',
};

type WorksheetRow = Tables<'deal_worksheet_row'>;

function emptyFieldValues(fields: WorksheetField[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.key, '']));
}

function fieldValuesFromRow(
  fields: WorksheetField[],
  data: WorksheetRowData,
): Record<string, string> {
  return Object.fromEntries(
    fields.map((field) => [field.key, data[field.key]?.toString() ?? '']),
  );
}

function toRowData(
  fields: WorksheetField[],
  values: Record<string, string>,
): WorksheetRowData {
  const data: WorksheetRowData = {};

  for (const field of fields) {
    const raw = (values[field.key] ?? '').trim();
    const isNumeric = field.kind === 'number' || field.kind === 'currency';
    data[field.key] = raw === '' ? null : isNumeric ? Number(raw) : raw;
  }

  return data;
}

function WorksheetFieldInput(props: {
  field: WorksheetField;
  value: string;
  onChange: (value: string) => void;
}) {
  if (props.field.kind === 'select') {
    return (
      <Select value={props.value} onValueChange={props.onChange}>
        <SelectTrigger>
          <SelectValue placeholder={props.field.label} />
        </SelectTrigger>
        <SelectContent>
          {(props.field.options ?? []).map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      type={props.field.kind === 'text' ? 'text' : 'number'}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    />
  );
}

function WorksheetSection(props: {
  dealId: string;
  type: DealWorksheetType;
  rows: WorksheetRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const fields = WORKSHEET_FIELD_CATALOG[props.type];
  const columns = worksheetColumns(props.type);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [addValues, setAddValues] = useState<Record<string, string>>(
    emptyFieldValues(fields),
  );

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  function startEdit(row: WorksheetRow) {
    setEditingId(row.id);
    setEditValues(fieldValuesFromRow(fields, row.data as WorksheetRowData));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValues({});
  }

  function saveEdit(row: WorksheetRow) {
    run(async () => {
      await saveWorksheetRow({
        id: row.id,
        deal_id: props.dealId,
        worksheet_type: props.type,
        data: toRowData(fields, editValues),
        sort_order: row.sort_order,
      });
      setEditingId(null);
    });
  }

  function addRow() {
    run(async () => {
      await saveWorksheetRow({
        deal_id: props.dealId,
        worksheet_type: props.type,
        data: toRowData(fields, addValues),
        sort_order: props.rows.length,
      });
      setAddValues(emptyFieldValues(fields));
    });
  }

  function removeRow(row: WorksheetRow) {
    run(() => deleteWorksheetRow({ id: row.id }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{WORKSHEET_TITLES[props.type]}</CardTitle>
      </CardHeader>
      <CardContent className={'flex flex-col gap-4'}>
        {props.rows.length === 0 ? (
          <p className={'text-sm text-muted-foreground'}>No rows yet</p>
        ) : (
          <div className={'overflow-x-auto'}>
            <table className={'w-full text-sm'}>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className={'px-2 py-1 text-left text-muted-foreground'}
                    >
                      {column.label}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {props.rows.map((row) => {
                  const isEditing = editingId === row.id;
                  const cells = worksheetDisplayCells(
                    props.type,
                    row.data as WorksheetRowData,
                  );
                  const computedCells = cells.slice(fields.length);

                  return (
                    <tr key={row.id} className={'border-t'}>
                      {fields.map((field) => (
                        <td key={field.key} className={'px-2 py-1'}>
                          {isEditing ? (
                            <WorksheetFieldInput
                              field={field}
                              value={editValues[field.key] ?? ''}
                              onChange={(value) =>
                                setEditValues((prev) => ({ ...prev, [field.key]: value }))
                              }
                            />
                          ) : (
                            cells.find((cell) => cell.key === field.key)?.value
                          )}
                        </td>
                      ))}
                      {computedCells.map((cell) => (
                        <td key={cell.key} className={'px-2 py-1'}>
                          {cell.value}
                        </td>
                      ))}
                      <td className={'px-2 py-1 text-right'}>
                        {isEditing ? (
                          <div className={'flex justify-end gap-2'}>
                            <Button size={'sm'} disabled={pending} onClick={() => saveEdit(row)}>
                              Save
                            </Button>
                            <Button
                              size={'sm'}
                              variant={'ghost'}
                              disabled={pending}
                              onClick={cancelEdit}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className={'flex justify-end gap-2'}>
                            <Button
                              size={'sm'}
                              variant={'ghost'}
                              disabled={pending}
                              onClick={() => startEdit(row)}
                            >
                              Edit
                            </Button>
                            <Button
                              size={'sm'}
                              variant={'ghost'}
                              disabled={pending}
                              onClick={() => removeRow(row)}
                            >
                              Delete
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className={'grid grid-cols-2 gap-3 sm:grid-cols-4'}>
          {fields.map((field) => (
            <div key={field.key} className={'flex flex-col gap-2'}>
              <Label>{field.label}</Label>
              <WorksheetFieldInput
                field={field}
                value={addValues[field.key] ?? ''}
                onChange={(value) => setAddValues((prev) => ({ ...prev, [field.key]: value }))}
              />
            </div>
          ))}
        </div>
        <Button disabled={pending} onClick={addRow} className={'self-start'}>
          Add row
        </Button>
      </CardContent>
    </Card>
  );
}

export function DealWorksheets(props: { dealId: string; rows: WorksheetRow[] }) {
  return (
    <div className={'flex flex-col gap-6'}>
      {WORKSHEET_TYPES.map((type) => (
        <WorksheetSection
          key={type}
          dealId={props.dealId}
          type={type}
          rows={props.rows.filter((row) => row.worksheet_type === type)}
        />
      ))}
    </div>
  );
}
