import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { Vote } from "@/lib/deals";

export async function GET() {
  const sql = getSql();
  const rows = await sql`SELECT sku, vote FROM deal_feedback`;
  const feedback = Object.fromEntries(rows.map((row) => [row.sku, row.vote]));
  return NextResponse.json({ feedback });
}

export async function POST(request: Request) {
  const sql = getSql();
  const { sku, vote }: { sku: string; vote: Vote } = await request.json();
  await sql`
    INSERT INTO deal_feedback (sku, vote, created_at)
    VALUES (${sku}, ${vote}, now())
    ON CONFLICT (sku) DO UPDATE SET vote = excluded.vote, created_at = excluded.created_at
  `;
  return NextResponse.json({ sku, vote });
}

export async function DELETE(request: Request) {
  const sql = getSql();
  const sku = new URL(request.url).searchParams.get("sku");
  if (!sku) {
    return NextResponse.json({ error: "sku is required" }, { status: 400 });
  }
  await sql`DELETE FROM deal_feedback WHERE sku = ${sku}`;
  return NextResponse.json({ sku, vote: null });
}
