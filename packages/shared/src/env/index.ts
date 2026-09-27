export function getEnv(name: string, fallback?: string): string | undefined {
  return process.env[name] ?? fallback;
}

export function requireEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
