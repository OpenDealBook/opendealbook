import { lockName } from './unfinished-uploads';

const CHANNEL = 'lender-room-uploads';

export function holdWhileSending(id: string): () => void {
  let release = () => {};
  const held = new Promise<void>((done) => {
    release = done;
  });

  void navigator.locks.request(lockName(id), () => held);

  return release;
}

export async function lockNamesHeldElsewhere(): Promise<string[]> {
  const { held = [] } = await navigator.locks.query();

  return held.flatMap((lock) => (lock.name ? [lock.name] : []));
}

export function announceAnswered(owner: string) {
  const channel = new BroadcastChannel(CHANNEL);

  channel.postMessage({ answered: owner });
  channel.close();
}

export function onAnsweredElsewhere(
  owner: string,
  listener: () => void,
): () => void {
  const channel = new BroadcastChannel(CHANNEL);

  channel.onmessage = (message: MessageEvent<{ answered: string }>) => {
    if (message.data.answered === owner) {
      listener();
    }
  };

  return () => channel.close();
}
