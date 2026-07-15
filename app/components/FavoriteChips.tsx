import { lastCategorySegment } from "@/lib/deals";

export function FavoriteChips({
  favorites,
  onSelect,
  onRemove,
}: {
  favorites: string[];
  onSelect: (path: string) => void;
  onRemove: (path: string) => void;
}) {
  return (
    <div id="favorite-chips" className="favorite-chips" hidden={favorites.length === 0}>
      {favorites.map((path) => (
        <span className="favorite-chip" key={path}>
          <button type="button" className="favorite-chip-select" onClick={() => onSelect(path)}>
            ★ {lastCategorySegment(path)}
          </button>
          <button
            type="button"
            className="favorite-chip-remove"
            aria-label="Remove favorite"
            onClick={() => onRemove(path)}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
