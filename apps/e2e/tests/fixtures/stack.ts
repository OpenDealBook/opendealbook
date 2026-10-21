export const WEB_URL = 'http://localhost:3000';

// How the Novu and Documenso containers reach the e2e web server on the host.
export const WEB_URL_FROM_DOCKER = 'http://host.docker.internal:3000';

export const SUPABASE_URL = 'http://127.0.0.1:54321';

// The demo anon and service-role keys every local Supabase stack ships with.
export const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
export const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

export const MAILPIT_URL = 'http://127.0.0.1:54324';
export const MAILPIT_SMTP_PORT = 54325;

export const GOTENBERG_URL = 'http://localhost:3009';
export const DOCUMENSO_URL = 'http://localhost:3005';
export const NOVU_API_URL = 'http://localhost:3006';
export const TEMPORAL_UI_URL = 'http://localhost:8233';
export const TEMPORAL_TASK_QUEUE = 'opendealbook';

export const STAND_INS = {
  llm: 'http://localhost:4510',
  nango: 'http://localhost:4511',
  stripe: 'http://localhost:4512',
  gmail: 'http://localhost:4513',
} as const;

export const DOCUMENSO_WEBHOOK_SECRET =
  'e2e-documenso-webhook-secret-0123456789abcdef';
export const STRIPE_WEBHOOK_SECRET = 'whsec_e2e_opendealbook_stand_in_secret';
export const NANGO_SECRET_KEY = 'nango-e2e-stand-in-secret';

// llm_endpoint.api_key_secret_ref names this variable; the web server and the
// workers must both carry it for the LLM stand-in to be reachable.
export const LLM_API_KEY_ENV = 'E2E_LLM_API_KEY';
export const LLM_API_KEY = 'sk-e2e-stand-in';

export const serviceHeaders = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};
