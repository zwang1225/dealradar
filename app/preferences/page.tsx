"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SaveState = "loading" | "idle" | "saving" | "saved";

export default function PreferencesPage() {
  const [notes, setNotes] = useState("");
  const [email, setEmail] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("loading");

  useEffect(() => {
    fetch("/api/preferences")
      .then((res) => res.json())
      .then((data) => {
        setNotes(data.notes);
        setEmail(data.email);
        setSaveState("idle");
      });
  }, []);

  const handleSave = async () => {
    setSaveState("saving");
    await fetch("/api/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes, email }),
    });
    setSaveState("saved");
  };

  return (
    <main className="preferences-page">
      <p>
        <Link href="/">&larr; Back to deals</Link>
      </p>
      <h1>Preferences</h1>

      <label className="field-label" htmlFor="notification-email">
        Notification email
      </label>
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
        {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save"}
      </button>
    </main>
  );
}
