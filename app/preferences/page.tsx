"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SaveState = "loading" | "idle" | "saving" | "saved";

const VERIFY_ERROR_MESSAGES: Record<string, string> = {
  missing: "That verification link was missing its token.",
  invalid: "That verification link is invalid or was already used.",
  expired: "That verification link expired — try saving your email again.",
};

export default function PreferencesPage() {
  const [notes, setNotes] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/preferences")
      .then((res) => res.json())
      .then((data) => {
        setNotes(data.notes);
        setVerifiedEmail(data.email);
        setPendingEmail(data.pendingEmail);
        setEmail(data.pendingEmail || data.email);
        setSaveState("idle");
      });
  }, []);

  // Plain browser API rather than next/navigation's useSearchParams -- this
  // only needs to read the URL once on mount (no reactive route updates),
  // and avoids the Suspense-boundary requirement useSearchParams imposes on
  // an otherwise statically-rendered page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified")) {
      setBanner("Email verified.");
    } else if (params.get("verifyError")) {
      setBanner(VERIFY_ERROR_MESSAGES[params.get("verifyError") ?? ""] ?? "Verification failed.");
    }
  }, []);

  const handleSave = async () => {
    setSaveState("saving");
    const res = await fetch("/api/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes, email }),
    });
    const data = await res.json();
    setVerifiedEmail(data.email);
    setPendingEmail(data.pendingEmail);
    setSaveState("saved");
  };

  return (
    <main className="preferences-page">
      <p>
        <Link href="/">&larr; Back to deals</Link>
      </p>
      <h1>Preferences</h1>

      {banner ? <p className="banner">{banner}</p> : null}

      <label className="field-label" htmlFor="notification-email">
        Notification email
      </label>
      <p className="subtitle">
        {verifiedEmail ? `Currently sending to ${verifiedEmail}.` : "Not set yet."}
        {pendingEmail ? ` Waiting on verification for ${pendingEmail} — check your inbox.` : ""}
      </p>
      <input
        id="notification-email"
        type="email"
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
          setSaveState("idle");
        }}
        placeholder="you@example.com"
        disabled={saveState === "loading"}
      />

      <label className="field-label" htmlFor="preference-notes">
        Notes
      </label>
      <p className="subtitle">
        Freeform notes for future personalized picks — categories or brands you like or want to
        avoid, price range, anything else worth knowing.
      </p>
      <textarea
        id="preference-notes"
        value={notes}
        onChange={(event) => {
          setNotes(event.target.value);
          setSaveState("idle");
        }}
        rows={10}
        placeholder="e.g. Bold reds under $30, skip anything sweet, love Niagara region…"
        disabled={saveState === "loading"}
      />

      <button
        type="button"
        onClick={handleSave}
        disabled={saveState === "loading" || saveState === "saving"}
      >
        {saveState === "saving"
          ? "Saving…"
          : saveState === "saved" && pendingEmail
            ? "Verification email sent"
            : saveState === "saved"
              ? "Saved"
              : "Save"}
      </button>
    </main>
  );
}
