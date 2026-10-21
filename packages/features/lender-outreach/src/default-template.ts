export interface OutreachTemplate {
  subject: string;
  body: string;
}

export const DEFAULT_TEMPLATE: OutreachTemplate = {
  subject: '{{dealName}}: financing with {{teamName}}',
  body: `Hi {{contactName}},

I'm {{ourName}} from {{teamName}}.
We are working to buy {{dealName}} and think {{lenderName}} could be a good fit to finance it.

{{termsBlock}}

{{timelineBlock}}

I set up a private room with the details: {{roomLink}}
Sign in with this email address to see it.

Thanks,
{{ourName}}
{{teamName}}`,
};
