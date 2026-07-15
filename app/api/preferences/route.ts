import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

// Vercel's recommended way to build a production link when Deployment
// Protection is on (as it is here, via Vercel Authentication) -- VERCEL_URL
// is itself gated and would produce an unusable link.
function siteUrl() {
  return process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000";
}

async function sendVerificationEmail(to: string, token: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY/RESEND_FROM are not set.");
  }

  const verifyUrl = `${siteUrl()}/api/preferences/verify?token=${token}`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from,
      to,
      subject: "Confirm your DealRadar notification email",
      html: `<p>Click to confirm this email for DealRadar deal notifications:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 24 hours.</p>`,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend API error: ${res.status} ${await res.text()}`);
  }
}

export async function GET() {
  const sql = getSql();
  const rows = await sql`SELECT notes, email, pending_email FROM preferences WHERE id = 1`;
  return NextResponse.json({
    notes: rows[0]?.notes ?? "",
    email: rows[0]?.email ?? "",
    pendingEmail: rows[0]?.pending_email ?? null,
  });
}

export async function PUT(request: Request) {
  const sql = getSql();
  const { notes, email } = await request.json();
  const trimmedEmail = (email ?? "").trim();

  const current = await sql`SELECT email FROM preferences WHERE id = 1`;
  const currentEmail = current[0]?.email ?? "";

  if (trimmedEmail === currentEmail) {
    // Not an email change (typically just editing notes) -- leave email/
    // pending state untouched, don't send a spurious verification email.
    await sql`
      INSERT INTO preferences (id, notes, updated_at)
      VALUES (1, ${notes}, now())
      ON CONFLICT (id) DO UPDATE SET notes = excluded.notes, updated_at = excluded.updated_at
    `;
  } else if (trimmedEmail === "") {
    // Removing a notification target needs no verification -- only adding/
    // changing one does.
    await sql`
      INSERT INTO preferences (id, notes, email, pending_email, verification_token, verification_expires_at, updated_at)
      VALUES (1, ${notes}, '', NULL, NULL, NULL, now())
      ON CONFLICT (id) DO UPDATE SET
        notes = excluded.notes,
        email = '',
        pending_email = NULL,
        verification_token = NULL,
        verification_expires_at = NULL,
        updated_at = excluded.updated_at
    `;
  } else {
    // New/changed email -- start verification. The verified `email` column
    // is not touched until the link is clicked.
    const token = randomUUID();
    await sql`
      INSERT INTO preferences (id, notes, pending_email, verification_token, verification_expires_at, updated_at)
      VALUES (1, ${notes}, ${trimmedEmail}, ${token}, now() + interval '24 hours', now())
      ON CONFLICT (id) DO UPDATE SET
        notes = excluded.notes,
        pending_email = excluded.pending_email,
        verification_token = excluded.verification_token,
        verification_expires_at = excluded.verification_expires_at,
        updated_at = excluded.updated_at
    `;
    await sendVerificationEmail(trimmedEmail, token);
  }

  const rows = await sql`SELECT notes, email, pending_email FROM preferences WHERE id = 1`;
  return NextResponse.json({
    notes: rows[0]?.notes ?? "",
    email: rows[0]?.email ?? "",
    pendingEmail: rows[0]?.pending_email ?? null,
  });
}
