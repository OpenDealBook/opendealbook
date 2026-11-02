import { Context } from '@temporalio/activity';

const HEARTBEAT_EVERY_MS = 10_000;

export async function heartbeating<T>(work: () => Promise<T>): Promise<T> {
  const activity = Context.current();
  activity.heartbeat();
  const beating = setInterval(() => activity.heartbeat(), HEARTBEAT_EVERY_MS);
  try {
    return await work();
  } finally {
    clearInterval(beating);
  }
}
