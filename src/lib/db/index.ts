import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Neon's HTTP driver: one round trip per query, no connection pooling to
// manage, which is what serverless functions want. It cannot do interactive
// transactions — if a multi-statement transaction is ever needed, switch that
// call site to drizzle-orm/neon-serverless (WebSocket) rather than changing
// this default.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in, " +
      "or pull it from Vercel with `vercel env pull .env.local`.",
  );
}

export const db = drizzle({ client: neon(connectionString), schema });
export { schema };
