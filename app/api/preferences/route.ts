import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export async function GET() {
  const sql = getSql();
  const rows = await sql`SELECT notes FROM preferences WHERE id = 1`;
  return NextResponse.json({ notes: rows[0]?.notes ?? "" });
}

export async function PUT(request: Request) {
  const sql = getSql();
  const { notes } = await request.json();

  await sql`
    INSERT INTO preferences (id, notes, updated_at)
    VALUES (1, ${notes}, now())
    ON CONFLICT (id) DO UPDATE SET notes = excluded.notes, updated_at = excluded.updated_at
  `;

  const rows = await sql`SELECT notes FROM preferences WHERE id = 1`;
  return NextResponse.json({ notes: rows[0]?.notes ?? "" });
}
