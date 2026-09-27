export const dynamic = 'force-static';

const SHORT_SHA = (
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.NEXT_PUBLIC_COMMIT_SHA ??
  'dev'
).slice(0, 7);

export function GET() {
  return new Response(SHORT_SHA, {
    headers: { 'content-type': 'text/plain' },
  });
}
