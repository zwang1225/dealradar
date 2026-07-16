import { Badge, Flex, IconButton } from "@radix-ui/themes";
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
  if (favorites.length === 0) return null;

  return (
    <Flex id="favorite-chips" gap="2" wrap="wrap" className="favorite-chips">
      {favorites.map((path) => (
        <Badge key={path} size="2" variant="soft" color="ruby" radius="full" className="favorite-chip">
          <button type="button" className="favorite-chip-select" onClick={() => onSelect(path)}>
            ★ {lastCategorySegment(path)}
          </button>
          <IconButton
            type="button"
            size="1"
            variant="ghost"
            color="gray"
            radius="full"
            aria-label="Remove favorite"
            onClick={() => onRemove(path)}
          >
            ×
          </IconButton>
        </Badge>
      ))}
    </Flex>
  );
}
