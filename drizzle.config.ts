import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Vite convention: local secrets live in .env.local, not .env.
config({ path: ".env.local" });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
