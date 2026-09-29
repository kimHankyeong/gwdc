import { Pool, type PoolClient } from "pg";
export class Database {
  readonly pool: Pool;
  constructor(url: string) {
    this.pool = new Pool({ connectionString: url, max: 12, connectionTimeoutMillis: 5000,
      statement_timeout: 15000, idle_in_transaction_session_timeout: 20000 });
  }
  async tx<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try { await c.query("BEGIN"); const result = await work(c); await c.query("COMMIT"); return result; }
    catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; }
    finally { c.release(); }
  }
  async close() { await this.pool.end(); }
}
