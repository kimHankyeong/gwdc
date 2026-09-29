import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Database } from "./db.js";
config({path:fileURLToPath(new URL("../../.env",import.meta.url)),quiet:true});
if (!process.env.DATABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
const db = new Database(process.env.DATABASE_URL);
try { await db.tx(async c => { await c.query(await readFile(fileURLToPath(new URL("./db/001_initial.sql", import.meta.url)), "utf8")); }); }
finally { await db.close(); }
