import { neon, NeonQueryFunction } from "@neondatabase/serverless";

// Lazy so a missing DATABASE_URL only fails an actual request, not the
// build itself -- Next.js evaluates Route Handler modules during its build
// step's page-data collection, and neon() throws synchronously if the
// connection string is empty.
//
// Typed explicitly as NeonQueryFunction<false, false> (plain rows, not
// array-mode/full-results) -- ReturnType<typeof neon> doesn't resolve
// cleanly through the package's generic/overloaded signature.
let cached: NeonQueryFunction<false, false> | undefined;

export function getSql(): NeonQueryFunction<false, false> {
  if (!cached) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
    }
    cached = neon(process.env.DATABASE_URL);
  }
  return cached;
}
