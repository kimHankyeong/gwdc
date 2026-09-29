import { Pool, type PoolClient } from "pg";
export class Database {
  readonly pool: Pool;
  constructor(url: string, ca?: string) {
    const connection=new URL(url);if(ca)connection.searchParams.delete('sslmode');
    this.pool = new Pool({ connectionString: connection.href, max: ca?5:12, ...(ca?{ssl:{ca,rejectUnauthorized:true}}:{}), connectionTimeoutMillis: 5000,
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
