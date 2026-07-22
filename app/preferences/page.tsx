"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, TextArea } from "@radix-ui/themes";

type SaveState = "loading" | "idle" | "saving" | "saved";

export default function PreferencesPage() {
  const [notes, setNotes] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("loading");

  useEffect(() => {
    fetch("/api/preferences")
      .then((res) => res.json())
      .then((data) => {
        setNotes(data.notes);
        setSaveState("idle");
      });
  }, []);

  const handleSave = async () => {
    setSaveState("saving");
    await fetch("/api/preferences", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    setSaveState("saved");
  };

  return (
    <main className="preferences-page">
      <p>
        <Link href="/">&larr; Back to deals</Link>
      </p>
      <h1>Preferences</h1>

      <label className="field-label" htmlFor="preference-notes">
        Notes
      </label>
      <p className="subtitle">
        Freeform notes for future personalized picks — categories or brands you like or want to
        avoid, price range, anything else worth knowing.
      </p>
      <TextArea
        id="preference-notes"
        size="2"
        value={notes}
        onChange={(event) => {
          setNotes(event.target.value);
          setSaveState("idle");
        }}
        rows={10}
        placeholder="e.g. Bold reds under $30, skip anything sweet, love Niagara region…"
        disabled={saveState === "loading"}
      />

      <Button
        type="button"
        size="2"
        onClick={handleSave}
        disabled={saveState === "loading" || saveState === "saving"}
      >
        {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save"}
      </Button>
    </main>
  );
}
