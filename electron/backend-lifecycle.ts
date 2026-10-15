export interface BackendState { phase: 'starting' | 'running' | 'unavailable'; message: string }
export interface BackendConnection { port: number; secret: string }

/** One explicit attempt at a time. Exits from an old generation cannot invalidate its replacement. */
export class BackendLifecycle {
  state: BackendState = { phase: 'unavailable', message: 'The local backend has not started.' };
  connection: BackendConnection | null = null;
  private generation = 0;
  private pending?: Promise<BackendConnection>;
  constructor(private readonly changed: (state: BackendState) => void) {}
  private publish(state: BackendState) { this.state = state; this.changed(state); }
  start(launch: (exited: (message: string) => void) => Promise<BackendConnection>): Promise<BackendConnection> {
    if (this.pending) return this.pending;
    if (this.connection) return Promise.resolve(this.connection);
    const generation = ++this.generation;
    let ended = false;
    this.publish({ phase: 'starting', message: 'Starting the local backend…' });
    const exited = (message: string) => {
      ended = true;
      if (generation !== this.generation) return;
      this.connection = null;
      this.publish({ phase: 'unavailable', message });
    };
    this.pending = Promise.resolve().then(() => launch(exited)).then(connection => {
      if (ended) throw new Error('The backend exited during startup.');
      if (!Number.isInteger(connection.port) || connection.port < 1 || connection.port > 65535 || !/^[a-f0-9]{64}$/.test(connection.secret))
        throw new Error('The backend returned invalid connection details.');
      this.connection = connection;
      this.publish({ phase: 'running', message: 'The local backend is running.' });
      return connection;
    }).catch(error => { exited((error as Error).message); throw error; }).finally(() => { this.pending = undefined; });
    return this.pending;
  }
}
