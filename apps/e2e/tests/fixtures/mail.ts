import { expect } from '@playwright/test';

import { MAILPIT_URL } from './stack';

export interface MailMessage {
  id: string;
  subject: string;
  text: string;
  html: string;
}

interface MailpitSearch {
  messages: { ID: string; Subject: string }[];
}

interface MailpitMessage {
  ID: string;
  Subject: string;
  Text: string;
  HTML: string;
}

async function mailpit<Body>(path: string): Promise<Body> {
  const response = await fetch(`${MAILPIT_URL}${path}`);
  expect(response.ok, `Mailpit GET ${path}`).toBe(true);
  return response.json();
}

async function newestMatching(to: string, subject: RegExp | undefined) {
  const query = new URLSearchParams({ query: `to:"${to}"` });
  const { messages } = await mailpit<MailpitSearch>(`/api/v1/search?${query}`);
  return messages.find((summary) => !subject || subject.test(summary.Subject));
}

export async function waitForMessage({
  to,
  subject,
  timeout = 30_000,
}: {
  to: string;
  subject?: RegExp;
  timeout?: number;
}): Promise<MailMessage> {
  let found: Awaited<ReturnType<typeof newestMatching>>;

  await expect
    .poll(async () => (found = await newestMatching(to, subject)), {
      message: `an email to ${to}${subject ? ` with a subject matching ${subject}` : ''}`,
      timeout,
    })
    .toBeTruthy();

  const message = await mailpit<MailpitMessage>(`/api/v1/message/${found!.ID}`);

  return {
    id: message.ID,
    subject: message.Subject,
    text: message.Text,
    html: message.HTML,
  };
}

function decodeEntities(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function links(message: MailMessage): string[] {
  const fromHtml = [...message.html.matchAll(/href="([^"]+)"/g)].map((match) =>
    decodeEntities(match[1]!),
  );
  const fromText = message.text.match(/https?:\/\/[^\s<>"')\]]+/g) ?? [];
  return [...fromHtml, ...fromText];
}

export function firstLink(message: MailMessage, pattern: RegExp): string {
  const link = links(message).find((candidate) => pattern.test(candidate));
  expect(
    link,
    `a link matching ${pattern} in "${message.subject}"`,
  ).toBeDefined();
  return link!;
}

export async function waitForMessageContaining({
  to,
  text,
  timeout = 60_000,
}: {
  to: string;
  text: string;
  timeout?: number;
}): Promise<MailMessage> {
  let found: MailMessage | undefined;

  await expect
    .poll(
      async () => {
        const query = new URLSearchParams({ query: `to:"${to}"` });
        const { messages } = await mailpit<MailpitSearch>(`/api/v1/search?${query}`);
        for (const summary of messages) {
          const message = await mailpit<MailpitMessage>(`/api/v1/message/${summary.ID}`);
          if (message.HTML.includes(text) || message.Text.includes(text)) {
            found = {
              id: message.ID,
              subject: message.Subject,
              text: message.Text,
              html: message.HTML,
            };
            return true;
          }
        }
        return false;
      },
      { message: `an email to ${to} containing ${text}`, timeout },
    )
    .toBe(true);

  return found!;
}
