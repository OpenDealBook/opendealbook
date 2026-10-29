import { DEFAULT_MAX_TOUCHES } from '@odb/outreach-app/schema';
import { getSupabaseServerClient } from '@odb/supabase/server';
import { Card, CardContent } from '@odb/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@odb/ui/table';

import { EnrollForm, type EnrollFirm } from './enroll-form';
import { enrollmentStatusLabel } from './enrollment-status';
import { LetterReturnAddress } from './letter-return-address';
import { LetterTemplatesPanel } from './letter-templates-panel';
import { MailboxConnectForm } from './mailbox-connect-form';
import { MonthlyCaps } from './monthly-caps';
import { loadMonthlyCaps } from './monthly-caps-usage';
import { SequencesPanel, type Sequence } from './sequences-panel';
import { SettingsForm } from './settings-form';
import { DEFAULT_DAILY_CAP } from './outreach-defaults';
import { SuppressionForm } from './suppression-form';
import { awaitsUnknownSend } from './unknown-send';
import { UnknownSendActions } from './unknown-send-actions';

function formatDate(value: string | null): string {
  return value === null ? '' : new Date(value).toLocaleString();
}

export async function OutreachArea({
  accountId,
  canManageDeals,
}: {
  accountId: string;
  canManageDeals: boolean;
}) {
  const client = getSupabaseServerClient();

  const [
    mailboxes,
    sequenceRows,
    stepRows,
    firmRows,
    contactRows,
    setting,
    enrollments,
    suppressions,
    monthlyCaps,
    letterTemplates,
  ] = await Promise.all([
    client
      .from('mailbox_connection')
      .select('id, provider, email_address, status')
      .eq('account_id', accountId),
    client
      .from('outreach_sequence')
      .select('id, name, description, enabled, is_default')
      .eq('account_id', accountId)
      .order('created_at'),
    client
      .from('outreach_step')
      .select('sequence_id, ordinal, delay_days, channel, subject, body')
      .eq('account_id', accountId)
      .order('ordinal'),
    client.from('firm').select('id, name').eq('account_id', accountId).order('name'),
    client
      .from('contact')
      .select('id, name, email, firm_id')
      .eq('account_id', accountId),
    client
      .from('outreach_setting')
      .select(
        'daily_cap, max_touches, letter_return_name, letter_return_address_line1, letter_return_city, letter_return_state, letter_return_postal_code',
      )
      .eq('account_id', accountId)
      .maybeSingle(),
    client
      .from('outreach_enrollment')
      .select('id, status, target_email, next_send_at, sent_count, current_step')
      .eq('account_id', accountId)
      .order('next_send_at'),
    client
      .from('outreach_suppression')
      .select('id, email, reason, created_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false }),
    loadMonthlyCaps(accountId),
    client
      .from('letter_template')
      .select('id, name, body')
      .eq('account_id', accountId)
      .order('created_at'),
  ]);

  const returnAddress =
    setting.data?.letter_return_name &&
    setting.data.letter_return_address_line1 &&
    setting.data.letter_return_city &&
    setting.data.letter_return_state &&
    setting.data.letter_return_postal_code
      ? {
          name: setting.data.letter_return_name,
          addressLine1: setting.data.letter_return_address_line1,
          city: setting.data.letter_return_city,
          state: setting.data.letter_return_state,
          postalCode: setting.data.letter_return_postal_code,
        }
      : null;

  const sequences: Sequence[] = (sequenceRows.data ?? []).map((sequence) => ({
    id: sequence.id,
    name: sequence.name,
    description: sequence.description,
    enabled: sequence.enabled,
    isDefault: sequence.is_default,
    steps: (stepRows.data ?? [])
      .filter((step) => step.sequence_id === sequence.id)
      .map((step) => ({
        ordinal: step.ordinal,
        delayDays: step.delay_days,
        channel: step.channel,
        subject: step.subject,
        body: step.body,
      })),
  }));

  const firms: EnrollFirm[] = (firmRows.data ?? []).map((firm) => ({
    id: firm.id,
    name: firm.name,
    contacts: (contactRows.data ?? [])
      .filter((contact) => contact.firm_id === firm.id)
      .map((contact) => ({
        id: contact.id,
        name: contact.name,
        email: contact.email,
      })),
  }));

  const enrollmentIds = (enrollments.data ?? []).map((row) => row.id);
  const [recentMessages, unknownSends] = await Promise.all([
    client
      .from('outreach_message')
      .select('id, to_email, status, sent_at')
      .in('enrollment_id', enrollmentIds)
      .order('sent_at', { ascending: false })
      .limit(20),
    client
      .from('outreach_message')
      .select('enrollment_id, step_id')
      .in('enrollment_id', enrollmentIds)
      .eq('status', 'unknown')
      .throwOnError(),
  ]);
  const messages = recentMessages.data ?? [];

  return (
    <div className={'flex flex-col gap-10'}>
      <Section title={'Mailbox'}>
        {(mailboxes.data ?? []).length === 0 ? (
          <div className={'flex flex-col gap-4'}>
            <p className={'text-muted-foreground text-sm'}>
              Connect your mailbox to start sending.
            </p>
            <MailboxConnectForm accountId={accountId} />
          </div>
        ) : (
          <div className={'flex flex-col gap-2'}>
            {(mailboxes.data ?? []).map((mailbox) => (
              <Card key={mailbox.id}>
                <CardContent className={'flex items-center gap-4 pt-6 text-sm'}>
                  <span className={'font-medium capitalize'}>
                    {mailbox.provider}
                  </span>
                  <span>{mailbox.email_address}</span>
                  <span className={'text-muted-foreground'}>
                    {mailbox.status}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section title={'Sequences'}>
        <SequencesPanel accountId={accountId} sequences={sequences} />
      </Section>

      <Section title={'Letter templates'}>
        <LetterTemplatesPanel accountId={accountId} templates={letterTemplates.data ?? []} />
      </Section>

      <Section title={'Enroll targets'}>
        <EnrollForm
          accountId={accountId}
          firms={firms}
          sequences={sequences.map((sequence) => ({
            id: sequence.id,
            name: sequence.name,
          }))}
        />
      </Section>

      <Section title={'Settings'}>
        <SettingsForm
          accountId={accountId}
          dailyCap={setting.data?.daily_cap ?? DEFAULT_DAILY_CAP}
          maxTouches={setting.data?.max_touches ?? DEFAULT_MAX_TOUCHES}
        />
      </Section>

      <Section title={'Letter return address'}>
        <LetterReturnAddress accountId={accountId} address={returnAddress} />
      </Section>

      <Section title={'Monthly caps'}>
        <MonthlyCaps accountId={accountId} caps={monthlyCaps} />
      </Section>

      <Section title={'Status'}>
        <div className={'flex flex-col gap-6'}>
          <div className={'flex flex-col gap-2'}>
            <h3 className={'text-sm font-medium'}>Enrollments</h3>
            {(enrollments.data ?? []).length === 0 ? (
              <p className={'text-muted-foreground text-sm'}>No enrollments.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Target</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Next send</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Needs attention</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(enrollments.data ?? []).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.target_email}</TableCell>
                      <TableCell>{enrollmentStatusLabel(row.status)}</TableCell>
                      <TableCell>{formatDate(row.next_send_at)}</TableCell>
                      <TableCell>{row.sent_count}</TableCell>
                      <TableCell>
                        {awaitsUnknownSend(row, unknownSends.data) ? (
                          <UnknownSendActions enrollmentId={row.id} canResolve={canManageDeals} />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <div className={'flex flex-col gap-2'}>
            <h3 className={'text-sm font-medium'}>Recent messages</h3>
            {messages.length === 0 ? (
              <p className={'text-muted-foreground text-sm'}>No messages.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>To</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent at</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {messages.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.to_email}</TableCell>
                      <TableCell>{row.status}</TableCell>
                      <TableCell>{formatDate(row.sent_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </Section>

      <Section title={'Suppression'}>
        <div className={'flex flex-col gap-4'}>
          <SuppressionForm accountId={accountId} />
          {(suppressions.data ?? []).length === 0 ? (
            <p className={'text-muted-foreground text-sm'}>
              No suppressed emails.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Added</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(suppressions.data ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.email}</TableCell>
                    <TableCell>{row.reason}</TableCell>
                    <TableCell>{formatDate(row.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={'flex flex-col gap-4'}>
      <h2 className={'text-lg font-semibold'}>{title}</h2>
      {children}
    </section>
  );
}
