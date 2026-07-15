import { beforeEach, describe, expect, it } from "vitest";
import { getFavoriteCategories, isFavoriteCategory, toggleFavoriteCategory } from "./favorites";

// No jsdom here -- this is the smallest thing that makes lib/favorites.ts's
// bare `localStorage` references resolve at test time.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  } as unknown as Storage;
}

beforeEach(() => {
  globalThis.localStorage = createMemoryStorage();
});

describe("getFavoriteCategories", () => {
  it("returns [] when nothing is stored", () => {
    expect(getFavoriteCategories()).toEqual([]);
  });

  it("returns [] instead of throwing on corrupted JSON", () => {
    localStorage.setItem("dealradar:favoriteCategories", "{not json");
    expect(getFavoriteCategories()).toEqual([]);
  });

  it("returns [] if the stored value isn't an array", () => {
    localStorage.setItem("dealradar:favoriteCategories", JSON.stringify({ not: "an array" }));
    expect(getFavoriteCategories()).toEqual([]);
  });
});

describe("toggleFavoriteCategory", () => {
  it("adds a category to the front of the list", () => {
    expect(toggleFavoriteCategory("Wine")).toEqual(["Wine"]);
    expect(toggleFavoriteCategory("Spirits")).toEqual(["Spirits", "Wine"]);
  });

  it("removes a category that's already favorited (toggle off)", () => {
    toggleFavoriteCategory("Wine");
    toggleFavoriteCategory("Spirits");
    expect(toggleFavoriteCategory("Wine")).toEqual(["Spirits"]);
  });
});

describe("isFavoriteCategory", () => {
  it("reflects the current stored list", () => {
    expect(isFavoriteCategory("Wine")).toBe(false);
    toggleFavoriteCategory("Wine");
    expect(isFavoriteCategory("Wine")).toBe(true);
  });
});
