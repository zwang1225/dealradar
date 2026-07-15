// Runs once a day as the last step of .github/workflows/fetch-deals.yml,
// after today's deals are fetched AND committed -- a failure here must
// never block or risk that data being published. Picks/ranks today's deals
// with an LLM using preferences.notes + deal_feedback (both in Postgres,
// the Phase 2 data layer -- see docs/data-architecture.md), and emails the
// picks. No-ops cleanly (exit 0, not a failure) if no notification email is
// set, or if the LLM returns no picks worth sending.
//
// Deliberately dependency-free like the other scripts/ here: plain fetch()
// to OpenAI and Resend, no SDKs. Talks to Postgres directly rather than
// going through the Next.js API routes, since those sit behind Vercel
// Authentication, which would block this script's automated requests.
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "data");

// The one link the email can offer -- there's no per-product deep link
// available. api.lcbo.dev exposes no product URL/slug (confirmed via GraphQL
// introspection), and guessing at lcbo.com's own URL scheme from the sku
// proved unreliable (tested search-by-sku and search-by-name against the
// real site; neither reliably resolved).
const SITE_URL = process.env.SITE_URL ?? "https://dealradar-deal-radar-awesome.vercel.app";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

// Only the fields the LLM actually needs to pick/rank a deal. Notably drops
// `inStockStoreIds` (some deals carry 80+ store IDs -- irrelevant to picking
// and would bloat the prompt for nothing) and `thumbnailUrl`/`saleCategories`.
export function trimDealForPrompt(deal, feedbackBySku) {
  const trimmed = {
    sku: deal.sku,
    name: deal.name,
    category: deal.category,
    priceInCents: deal.priceInCents,
    regularPriceInCents: deal.regularPriceInCents,
    discountPercent: deal.discountPercent,
    unitVolumeMl: deal.unitVolumeMl,
    alcoholPercent: deal.alcoholPercent,
    priceDropped: deal.priceDropped,
    nearHistoricalLow: deal.nearHistoricalLow,
  };
  const vote = feedbackBySku[deal.sku];
  if (vote) trimmed.yourFeedback = vote;
  return trimmed;
}

// Never fabricates deal data -- the prompt only ever contains what's
// actually in lcbo-deals.json, trimmed to the fields above.
export function buildPrompt(preferences, trimmedDeals) {
  const notes = preferences.notes?.trim();
  const instructions = notes
    ? `The user's stated preferences: ${notes}`
    : "The user hasn't set any preferences yet -- fall back to objectively strong deals: highest discountPercent and nearHistoricalLow/priceDropped.";

  return [
    "You are picking today's best deals from an Ontario LCBO deals feed, for one specific user.",
    instructions,
    "Some deals have a yourFeedback field ('up' or 'down') from this user's past votes on that exact product -- weigh that signal heavily.",
    "Pick 3 to 8 deals genuinely worth highlighting. Fewer is fine, and zero is fine, if nothing stands out. Never pad the list to hit a count.",
    "Give a short one-sentence reason for each pick.",
    `Today's deals (JSON array): ${JSON.stringify(trimmedDeals)}`,
  ].join("\n\n");
}

export function shouldSkip(preferences) {
  return !preferences?.email;
}

const PICKS_SCHEMA = {
  name: "deal_picks",
  strict: true,
  schema: {
    type: "object",
    properties: {
      picks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            sku: { type: "string" },
            reason: { type: "string" },
          },
          required: ["sku", "reason"],
          additionalProperties: false,
        },
      },
    },
    required: ["picks"],
    additionalProperties: false,
  },
};

async function pickDeals(prompt) {
  const apiKey = requireEnv("OPENAI_API_KEY");
  const model = requireEnv("OPENAI_MODEL");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_schema", json_schema: PICKS_SCHEMA },
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI response had no content");
  return JSON.parse(content).picks ?? [];
}

const centsToDollars = (cents) => `$${(cents / 100).toFixed(2)}`;

function formatBottleInfo(deal) {
  const parts = [];
  if (deal.unitVolumeMl != null) {
    parts.push(
      deal.unitVolumeMl >= 1000
        ? `${(deal.unitVolumeMl / 1000).toFixed(deal.unitVolumeMl % 1000 === 0 ? 0 : 1)} L`
        : `${deal.unitVolumeMl} mL`,
    );
  }
  if (deal.alcoholPercent != null) parts.push(`${deal.alcoholPercent}% ABV`);
  return parts.join(" · ");
}

export function buildEmailHtml(picks, dealsBySku, date) {
  const items = picks
    .map((pick) => {
      const deal = dealsBySku[pick.sku];
      if (!deal) return "";
      const bottleInfo = formatBottleInfo(deal);
      const regular = deal.regularPriceInCents ? ` <s>${centsToDollars(deal.regularPriceInCents)}</s>` : "";
      return `
        <li style="margin-bottom: 1.25rem;">
          <strong>${deal.name}</strong><br/>
          ${centsToDollars(deal.priceInCents)}${regular}${bottleInfo ? ` · ${bottleInfo}` : ""}<br/>
          <em>${pick.reason}</em>
        </li>
      `;
    })
    .join("");

  return `
    <h1>DealRadar picks for ${date}</h1>
    <ul>${items}</ul>
    <p><a href="${SITE_URL}">View all deals on DealRadar</a></p>
  `;
}

async function sendEmail(html, to, date) {
  const apiKey = requireEnv("RESEND_API_KEY");
  const from = requireEnv("RESEND_FROM");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, subject: `DealRadar picks for ${date}`, html }),
  });

  if (!res.ok) {
    throw new Error(`Resend API error: ${res.status} ${await res.text()}`);
  }
}

async function main() {
  const sql = neon(requireEnv("DATABASE_URL"));

  const [preferencesRows, feedbackRows, dealsFile] = await Promise.all([
    sql`SELECT notes, email FROM preferences WHERE id = 1`,
    sql`SELECT sku, vote FROM deal_feedback`,
    readFile(path.join(DATA_DIR, "lcbo-deals.json"), "utf8"),
  ]);

  const preferences = preferencesRows[0] ?? { notes: "", email: "" };
  if (shouldSkip(preferences)) {
    console.log("No notification email set, skipping.");
    return;
  }

  const feedbackBySku = Object.fromEntries(feedbackRows.map((row) => [row.sku, row.vote]));
  const { deals } = JSON.parse(dealsFile);
  const trimmedDeals = deals.map((deal) => trimDealForPrompt(deal, feedbackBySku));

  const picks = await pickDeals(buildPrompt(preferences, trimmedDeals));
  if (picks.length === 0) {
    console.log("No picks today.");
    return;
  }

  const dealsBySku = Object.fromEntries(deals.map((deal) => [deal.sku, deal]));
  const date = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  await sendEmail(buildEmailHtml(picks, dealsBySku, date), preferences.email, date);

  console.log(`Sent ${picks.length} picks to ${preferences.email}.`);
}

// Only run when executed directly (`node scripts/notify.mjs`), not when
// imported by scripts/notify.test.mjs -- otherwise importing this module
// for its pure helpers would also kick off a real DB/OpenAI/Resend run.
const isMainModule = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
