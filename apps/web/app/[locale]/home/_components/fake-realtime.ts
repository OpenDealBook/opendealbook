type Row = Record<string, string>;
type Event = 'INSERT' | 'UPDATE';

interface Listener {
  event: Event;
  table: string;
  filter: string;
  deliver: (change: { new: Row }) => void;
}

export function fakeRealtime() {
  const bindings = new Map<object, Listener[]>();
  const joined = new Set<object>();
  const authorizing: Promise<void>[] = [];
  let authorized = false;

  const client = {
    realtime: {
      setAuth() {
        const done = Promise.resolve().then(() => {
          authorized = true;
        });
        authorizing.push(done);
        return done;
      },
    },
    channel() {
      const channel = {
        on(
          _type: 'postgres_changes',
          config: { event: Event; table: string; filter: string },
          deliver: Listener['deliver'],
        ) {
          bindings.set(channel, [
            ...(bindings.get(channel) ?? []),
            { ...config, deliver },
          ]);
          return channel;
        },
        subscribe() {
          // Realtime reads the token as a channel joins, so a channel that
          // joins before auth is set joins as anon and receives no rows.
          if (authorized) {
            joined.add(channel);
          }
          return channel;
        },
      };

      return channel;
    },
    removeChannel: async (channel: object) => {
      joined.delete(channel);
    },
  };

  async function emit(event: Event, table: string, row: Row) {
    await Promise.all(authorizing);
    await Promise.resolve();

    for (const listener of [...joined].flatMap(
      (channel) => bindings.get(channel)!,
    )) {
      const [column, value] = listener.filter.split('=eq.');

      if (
        listener.event === event &&
        listener.table === table &&
        row[column!] === value
      ) {
        listener.deliver({ new: row });
      }
    }
  }

  return {
    client,
    insert: (table: string, row: Row) => emit('INSERT', table, row),
    update: (table: string, row: Row) => emit('UPDATE', table, row),
  };
}
