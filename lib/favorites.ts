// A small list of favorited category paths — the whole point is quick
// one-click access to them (rendered as chips), not just a remembered
// default on page load. Most-recently-favorited first.
const FAVORITE_CATEGORIES_KEY = "dealradar:favoriteCategories";

export function getFavoriteCategories(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(FAVORITE_CATEGORIES_KEY) ?? "null");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

export function isFavoriteCategory(path: string): boolean {
  return getFavoriteCategories().includes(path);
}

export function toggleFavoriteCategory(path: string): string[] {
  const current = getFavoriteCategories();
  const next = current.includes(path) ? current.filter((c) => c !== path) : [path, ...current];
  localStorage.setItem(FAVORITE_CATEGORIES_KEY, JSON.stringify(next));
  return next;
}
