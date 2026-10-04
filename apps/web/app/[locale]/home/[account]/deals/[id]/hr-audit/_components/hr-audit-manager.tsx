'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import type { HrAuditProvider } from '@odb/hr-audit/schema';
import {
  addEmployee,
  createHrAuditEngagement,
  updateHrAuditEngagement,
} from '@odb/hr-audit/server';
import type { Tables } from '@odb/supabase';
import { Badge } from '@odb/ui/badge';
import { Button } from '@odb/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@odb/ui/card';
import { Checkbox } from '@odb/ui/checkbox';
import { Input } from '@odb/ui/input';
import { Label } from '@odb/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@odb/ui/select';
import { StatusDropdown, type StatusValue } from '@odb/ui/status-dropdown';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';
import { Textarea } from '@odb/ui/textarea';

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function money(value: number | null): string {
  return value === null ? 'Not set' : currency.format(value);
}

function textOrNotSet(value: string | number | null): string {
  return value === null ? 'Not set' : String(value);
}

const FLAG_LABELS: { key: 'non_compete' | 'non_solicit' | 'key_person'; label: string }[] = [
  { key: 'key_person', label: 'Key person' },
  { key: 'non_compete', label: 'Non-compete' },
  { key: 'non_solicit', label: 'Non-solicit' },
];

const emptyEmployeeForm = {
  name: '',
  role: '',
  comp: '',
  tenure_years: '',
  credentials: '',
  non_compete: false,
  non_solicit: false,
  key_person: false,
};

export function HrAuditManager({
  dealId,
  accountId,
  engagement,
  employees,
}: {
  dealId: string;
  accountId: string;
  engagement: Tables<'hr_audit_engagement'> | null;
  employees: Tables<'employee'>[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [engagementForm, setEngagementForm] = useState(() => ({
    provider: (engagement?.provider as HrAuditProvider) ?? 'third_party',
    vendor_name: engagement?.vendor_name ?? '',
    vendor_contact: engagement?.vendor_contact ?? '',
    scope: engagement?.scope ?? '',
    status: (engagement?.status as StatusValue) ?? 'not_started',
  }));

  const [employeeForm, setEmployeeForm] = useState(emptyEmployeeForm);

  function saveEngagement() {
    const fields = {
      provider: engagementForm.provider,
      vendor_name: engagementForm.vendor_name || undefined,
      vendor_contact: engagementForm.vendor_contact || undefined,
      scope: engagementForm.scope || undefined,
      status: engagementForm.status,
    };

    startTransition(async () => {
      if (engagement === null) {
        await createHrAuditEngagement({
          deal_id: dealId,
          account_id: accountId,
          ...fields,
        });
      } else {
        await updateHrAuditEngagement({ id: engagement.id, ...fields });
      }
      router.refresh();
    });
  }

  function addNewEmployee() {
    startTransition(async () => {
      await addEmployee({
        deal_id: dealId,
        account_id: accountId,
        name: employeeForm.name,
        role: employeeForm.role || undefined,
        comp: employeeForm.comp ? Number(employeeForm.comp) : undefined,
        tenure_years: employeeForm.tenure_years
          ? Number(employeeForm.tenure_years)
          : undefined,
        credentials: employeeForm.credentials || undefined,
        non_compete: employeeForm.non_compete,
        non_solicit: employeeForm.non_solicit,
        key_person: employeeForm.key_person,
      });
      setEmployeeForm(emptyEmployeeForm);
      router.refresh();
    });
  }

  return (
    <div className={'flex flex-col gap-6'}>
      <Card>
        <CardHeader>
          <CardTitle>Engagement</CardTitle>
        </CardHeader>
        <CardContent className={'flex flex-col gap-4'}>
          <div className={'grid grid-cols-1 gap-4 sm:grid-cols-2'}>
            <div className={'flex flex-col gap-1.5'}>
              <Label>Provider</Label>
              <Select
                value={engagementForm.provider}
                onValueChange={(value) =>
                  setEngagementForm((prev) => ({
                    ...prev,
                    provider: value as HrAuditProvider,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={'third_party'}>Third party</SelectItem>
                  <SelectItem value={'internal'}>Internal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className={'flex flex-col gap-1.5'}>
              <Label>Status</Label>
              <StatusDropdown
                value={engagementForm.status}
                onChange={(value) =>
                  setEngagementForm((prev) => ({ ...prev, status: value }))
                }
              />
            </div>
            <div className={'flex flex-col gap-1.5'}>
              <Label htmlFor={'vendor_name'}>Vendor name</Label>
              <Input
                id={'vendor_name'}
                value={engagementForm.vendor_name}
                onChange={(event) =>
                  setEngagementForm((prev) => ({
                    ...prev,
                    vendor_name: event.target.value,
                  }))
                }
              />
            </div>
            <div className={'flex flex-col gap-1.5'}>
              <Label htmlFor={'vendor_contact'}>Vendor contact</Label>
              <Input
                id={'vendor_contact'}
                value={engagementForm.vendor_contact}
                onChange={(event) =>
                  setEngagementForm((prev) => ({
                    ...prev,
                    vendor_contact: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div className={'flex flex-col gap-1.5'}>
            <Label htmlFor={'scope'}>Scope</Label>
            <Textarea
              id={'scope'}
              value={engagementForm.scope}
              onChange={(event) =>
                setEngagementForm((prev) => ({
                  ...prev,
                  scope: event.target.value,
                }))
              }
            />
          </div>
          <div>
            <Button onClick={saveEngagement} disabled={pending}>
              {engagement === null ? 'Create engagement' : 'Save engagement'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Employees</CardTitle>
        </CardHeader>
        <CardContent className={'flex flex-col gap-6'}>
          {employees.length === 0 ? (
            <p className={'text-muted-foreground text-sm'}>
              No employees assessed yet
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Comp</TableHead>
                  <TableHead>Tenure</TableHead>
                  <TableHead>Flags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell>{employee.name}</TableCell>
                    <TableCell>{textOrNotSet(employee.role)}</TableCell>
                    <TableCell>{money(employee.comp)}</TableCell>
                    <TableCell>
                      {employee.tenure_years === null
                        ? 'Not set'
                        : `${employee.tenure_years} yr`}
                    </TableCell>
                    <TableCell className={'flex flex-wrap gap-1'}>
                      {FLAG_LABELS.filter((flag) => employee[flag.key]).map(
                        (flag) => (
                          <Badge key={flag.key} variant={'outline'}>
                            {flag.label}
                          </Badge>
                        ),
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className={'flex flex-col gap-4 border-t pt-6'}>
            <h3 className={'text-sm font-medium'}>Add employee</h3>
            <div className={'grid grid-cols-1 gap-4 sm:grid-cols-2'}>
              <div className={'flex flex-col gap-1.5'}>
                <Label htmlFor={'employee_name'}>Name</Label>
                <Input
                  id={'employee_name'}
                  value={employeeForm.name}
                  onChange={(event) =>
                    setEmployeeForm((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                />
              </div>
              <div className={'flex flex-col gap-1.5'}>
                <Label htmlFor={'employee_role'}>Role</Label>
                <Input
                  id={'employee_role'}
                  value={employeeForm.role}
                  onChange={(event) =>
                    setEmployeeForm((prev) => ({
                      ...prev,
                      role: event.target.value,
                    }))
                  }
                />
              </div>
              <div className={'flex flex-col gap-1.5'}>
                <Label htmlFor={'employee_comp'}>Comp</Label>
                <Input
                  id={'employee_comp'}
                  type={'number'}
                  value={employeeForm.comp}
                  onChange={(event) =>
                    setEmployeeForm((prev) => ({
                      ...prev,
                      comp: event.target.value,
                    }))
                  }
                />
              </div>
              <div className={'flex flex-col gap-1.5'}>
                <Label htmlFor={'employee_tenure'}>Tenure years</Label>
                <Input
                  id={'employee_tenure'}
                  type={'number'}
                  value={employeeForm.tenure_years}
                  onChange={(event) =>
                    setEmployeeForm((prev) => ({
                      ...prev,
                      tenure_years: event.target.value,
                    }))
                  }
                />
              </div>
              <div className={'flex flex-col gap-1.5 sm:col-span-2'}>
                <Label htmlFor={'employee_credentials'}>Credentials</Label>
                <Input
                  id={'employee_credentials'}
                  value={employeeForm.credentials}
                  onChange={(event) =>
                    setEmployeeForm((prev) => ({
                      ...prev,
                      credentials: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className={'flex flex-wrap gap-6'}>
              {FLAG_LABELS.map((flag) => (
                <label
                  key={flag.key}
                  className={'flex items-center gap-2 text-sm'}
                >
                  <Checkbox
                    checked={employeeForm[flag.key]}
                    onCheckedChange={(checked) =>
                      setEmployeeForm((prev) => ({
                        ...prev,
                        [flag.key]: checked === true,
                      }))
                    }
                  />
                  {flag.label}
                </label>
              ))}
            </div>
            <div>
              <Button
                onClick={addNewEmployee}
                disabled={pending || employeeForm.name.trim() === ''}
              >
                Add employee
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
