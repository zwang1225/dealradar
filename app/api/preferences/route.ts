import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export async function GET() {
  const sql = getSql();
  const rows = await sql`SELECT notes, email FROM preferences WHERE id = 1`;
  return NextResponse.json({ notes: rows[0]?.notes ?? "", email: rows[0]?.email ?? "" });
}

export async function PUT(request: Request) {
  const sql = getSql();
  const { notes, email } = await request.json();
  await sql`
    INSERT INTO preferences (id, notes, email, updated_at)
    VALUES (1, ${notes}, ${email}, now())
    ON CONFLICT (id) DO UPDATE SET notes = excluded.notes, email = excluded.email, updated_at = excluded.updated_at
  `;
  return NextResponse.json({ notes, email });
}
