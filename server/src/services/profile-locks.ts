const queues = new Map<string, Promise<unknown>>();

/** Hold through read, revision check, write and index refresh. Keys include the data directory. */
export function withProfileLock<T>(key: string, action: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const run = previous.then(action, action);
  const settled = run.then(() => undefined, () => undefined);
  queues.set(key, settled);
  void settled.then(() => { if (queues.get(key) === settled) queues.delete(key); });
  return run;
}
