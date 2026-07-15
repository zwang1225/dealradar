import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

// Reached by clicking the link in the verification email, so this must be a
// GET (not PUT/POST) -- email clients only ever issue GET requests for links.
export async function GET(request: Request) {
  const sql = getSql();
  const token = new URL(request.url).searchParams.get("token");
  const redirectTo = new URL("/preferences", request.url);

  if (!token) {
    redirectTo.searchParams.set("verifyError", "missing");
    return NextResponse.redirect(redirectTo);
  }

  const rows = await sql`
    SELECT pending_email, verification_expires_at
    FROM preferences
    WHERE id = 1 AND verification_token = ${token}
  `;
  const row = rows[0];

  if (!row || !row.pending_email) {
    redirectTo.searchParams.set("verifyError", "invalid");
    return NextResponse.redirect(redirectTo);
  }

  if (new Date(row.verification_expires_at) < new Date()) {
    redirectTo.searchParams.set("verifyError", "expired");
    return NextResponse.redirect(redirectTo);
  }

  await sql`
    UPDATE preferences
    SET email = pending_email,
        pending_email = NULL,
        verification_token = NULL,
        verification_expires_at = NULL,
        updated_at = now()
    WHERE id = 1
  `;

  redirectTo.searchParams.set("verified", "1");
  return NextResponse.redirect(redirectTo);
}
