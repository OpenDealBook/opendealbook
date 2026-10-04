'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Badge } from '@odb/ui/badge';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';
import { Textarea } from '@odb/ui/textarea';
import {
  installWorkbookAction,
  pauseWorkbookAction,
  resumeWorkbookAction,
} from '@odb/workbooks/server';

interface WorkbookRow {
  id: string;
  templateId: string;
  status: string | null;
  subject: string | null;
}

interface TemplateOption {
  id: string;
  name: string;
  workflow_type: string;
}

const emptyBrokerConfig = {
  dealLeadUserId: '',
  fromEmail: '',
  subject: '',
  updates: '',
  bookACallUrl: '',
};

export function DealWorkbooks(props: {
  accountId: string;
  workbooks: WorkbookRow[];
  templates: TemplateOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [templateId, setTemplateId] = useState('');
  const [config, setConfig] = useState(emptyBrokerConfig);

  const templateName = new Map(
    props.templates.map((template) => [template.id, template.name]),
  );

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  function install() {
    run(async () => {
      await installWorkbookAction({
        accountId: props.accountId,
        templateId,
        config,
      });
      setTemplateId('');
      setConfig(emptyBrokerConfig);
    });
  }

  function field(key: keyof typeof emptyBrokerConfig, value: string) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className={'flex flex-col gap-6'}>
      <Card>
        <CardHeader>
          <CardTitle>Installed workbooks</CardTitle>
        </CardHeader>
        <CardContent>
          {props.workbooks.length === 0 ? (
            <p className={'text-muted-foreground text-sm'}>
              No workbooks installed yet
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Template</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.workbooks.map((workbook) => (
                  <TableRow key={workbook.id}>
                    <TableCell>
                      {templateName.get(workbook.templateId) ??
                        workbook.templateId}
                    </TableCell>
                    <TableCell>{workbook.subject ?? 'Not set'}</TableCell>
                    <TableCell>
                      <Badge variant={'outline'}>
                        {workbook.status ?? 'unknown'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {workbook.status === 'paused' ? (
                        <Button
                          variant={'outline'}
                          size={'sm'}
                          disabled={pending}
                          onClick={() =>
                            run(() =>
                              resumeWorkbookAction({ workbookId: workbook.id }),
                            )
                          }
                        >
                          Resume
                        </Button>
                      ) : (
                        <Button
                          variant={'outline'}
                          size={'sm'}
                          disabled={pending}
                          onClick={() =>
                            run(() =>
                              pauseWorkbookAction({ workbookId: workbook.id }),
                            )
                          }
                        >
                          Pause
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Install a workbook</CardTitle>
        </CardHeader>
        <CardContent className={'flex flex-col gap-4'}>
          <div className={'flex flex-col gap-1.5'}>
            <Label>Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className={'w-full'}>
                <SelectValue placeholder={'Choose a template'} />
              </SelectTrigger>
              <SelectContent>
                {props.templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {templateId === '' ? null : (
            <div className={'flex flex-col gap-4'}>
              <div className={'flex flex-col gap-1.5'}>
                <Label>Deal lead user id</Label>
                <Input
                  value={config.dealLeadUserId}
                  onChange={(event) =>
                    field('dealLeadUserId', event.target.value)
                  }
                />
              </div>
              <div className={'flex flex-col gap-1.5'}>
                <Label>From email</Label>
                <Input
                  type={'email'}
                  value={config.fromEmail}
                  onChange={(event) => field('fromEmail', event.target.value)}
                />
              </div>
              <div className={'flex flex-col gap-1.5'}>
                <Label>Subject</Label>
                <Input
                  value={config.subject}
                  onChange={(event) => field('subject', event.target.value)}
                />
              </div>
              <div className={'flex flex-col gap-1.5'}>
                <Label>Updates</Label>
                <Textarea
                  value={config.updates}
                  onChange={(event) => field('updates', event.target.value)}
                />
              </div>
              <div className={'flex flex-col gap-1.5'}>
                <Label>Book a call url</Label>
                <Input
                  value={config.bookACallUrl}
                  onChange={(event) => field('bookACallUrl', event.target.value)}
                />
              </div>
              <Button
                className={'self-start'}
                disabled={pending}
                onClick={install}
              >
                Install workbook
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
