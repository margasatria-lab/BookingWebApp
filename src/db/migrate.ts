import "dotenv/config";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { neon } from "@neondatabase/serverless";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql);

  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  console.log("Migrations complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
