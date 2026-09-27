import pino from 'pino';

export type Logger = pino.Logger;

let instance: Logger | undefined;

export function getLogger(): Logger {
  return (instance ??= createLogger());
}

function createLogger(): Logger {
  const options: pino.LoggerOptions = {
    level: process.env.LOG_LEVEL ?? 'info',
  };

  if (process.env.NODE_ENV === 'development') {
    return pino({ ...options, transport: { target: 'pino-pretty' } });
  }

  return pino(options);
}
