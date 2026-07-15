// Creates the two tables Phase 2 (preferences + feedback) needs. This file
// is the schema's source of truth -- change it, then re-run
// `npm run db:migrate`, rather than hand-editing the schema in the Neon/
// Vercel dashboard. Idempotent (CREATE TABLE IF NOT EXISTS), safe to re-run.
//
// The Neon HTTP driver's tagged-template `sql` executes one statement per
// call, so this runs each CREATE TABLE separately rather than as one
// multi-statement script.
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS preferences (
      id INTEGER PRIMARY KEY DEFAULT 1,
      notes TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT preferences_single_row CHECK (id = 1)
    )
  `;

  // ADD COLUMN IF NOT EXISTS rather than baking `email` into the CREATE
  // TABLE above, since that statement no-ops once the table already exists
  // -- this keeps the migration re-runnable against a DB that was already
  // migrated before this column was added.
  await sql`
    ALTER TABLE preferences ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT ''
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS deal_feedback (
      sku TEXT PRIMARY KEY,
      vote TEXT NOT NULL CHECK (vote IN ('up', 'down')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  console.log("Schema applied: preferences (+email), deal_feedback.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
