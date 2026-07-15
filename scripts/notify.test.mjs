import { describe, expect, it } from "vitest";
import { buildEmailHtml, buildPrompt, shouldSkip, trimDealForPrompt } from "./notify.mjs";

function makeDeal(overrides = {}) {
  return {
    sku: "1",
    name: "Test Wine",
    category: "Products|Wine|Red Wine",
    priceInCents: 1000,
    regularPriceInCents: null,
    discountPercent: null,
    thumbnailUrl: "https://example.com/thumb.png",
    unitVolumeMl: null,
    alcoholPercent: null,
    saleCategories: ["Bin End Sale"],
    priceDropped: false,
    nearHistoricalLow: false,
    inStockStoreIds: ["1", "2", "3"],
    ...overrides,
  };
}

describe("trimDealForPrompt", () => {
  it("drops fields the LLM doesn't need", () => {
    const trimmed = trimDealForPrompt(makeDeal(), {});
    expect(trimmed).not.toHaveProperty("inStockStoreIds");
    expect(trimmed).not.toHaveProperty("thumbnailUrl");
    expect(trimmed).not.toHaveProperty("saleCategories");
  });

  it("attaches yourFeedback when the sku has a vote", () => {
    const trimmed = trimDealForPrompt(makeDeal({ sku: "42" }), { 42: "up" });
    expect(trimmed.yourFeedback).toBe("up");
  });

  it("omits yourFeedback when there's no vote for this sku", () => {
    const trimmed = trimDealForPrompt(makeDeal({ sku: "42" }), { 99: "down" });
    expect(trimmed).not.toHaveProperty("yourFeedback");
  });
});

describe("buildPrompt", () => {
  it("includes the user's stated preferences when notes are set", () => {
    const prompt = buildPrompt({ notes: "Bold reds under $30", email: "a@b.com" }, []);
    expect(prompt).toContain("Bold reds under $30");
  });

  it("falls back to an objective-deals instruction when notes are empty", () => {
    const prompt = buildPrompt({ notes: "", email: "a@b.com" }, []);
    expect(prompt).toContain("hasn't set any preferences yet");
    expect(prompt).toContain("discountPercent");
  });

  it("embeds the trimmed deals as JSON", () => {
    const deals = [{ sku: "1", name: "Test Wine" }];
    const prompt = buildPrompt({ notes: "", email: "a@b.com" }, deals);
    expect(prompt).toContain(JSON.stringify(deals));
  });
});

describe("shouldSkip", () => {
  it("skips when there's no notification email", () => {
    expect(shouldSkip({ notes: "", email: "" })).toBe(true);
    expect(shouldSkip({ notes: "", email: undefined })).toBe(true);
  });

  it("doesn't skip once an email is set", () => {
    expect(shouldSkip({ notes: "", email: "a@b.com" })).toBe(false);
  });
});

describe("buildEmailHtml", () => {
  it("renders name, price, and reason for each pick", () => {
    const deal = makeDeal({ sku: "1", name: "Great Red", priceInCents: 1999 });
    const html = buildEmailHtml([{ sku: "1", reason: "Big discount" }], { 1: deal }, "2026-07-15");
    expect(html).toContain("Great Red");
    expect(html).toContain("$19.99");
    expect(html).toContain("Big discount");
    expect(html).toContain("2026-07-15");
  });

  it("shows the regular price struck through when a discount exists", () => {
    const deal = makeDeal({ sku: "1", priceInCents: 1000, regularPriceInCents: 1500 });
    const html = buildEmailHtml([{ sku: "1", reason: "x" }], { 1: deal }, "2026-07-15");
    expect(html).toContain("<s>$15.00</s>");
  });

  it("skips a pick whose sku isn't in today's deals", () => {
    const html = buildEmailHtml([{ sku: "missing", reason: "x" }], {}, "2026-07-15");
    expect(html).not.toContain("missing");
  });

  it("links back to the site", () => {
    const html = buildEmailHtml([], {}, "2026-07-15");
    expect(html).toContain("vercel.app");
  });
});
