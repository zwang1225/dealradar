import { Flex, IconButton } from "@radix-ui/themes";
import { Vote } from "@/lib/deals";

export function ThumbButtons({
  sku,
  vote,
  onVote,
}: {
  sku: string;
  vote: Vote | undefined;
  onVote: (sku: string, vote: Vote) => void;
}) {
  return (
    <Flex gap="2" className="vote-buttons">
      <IconButton
        type="button"
        variant={vote === "up" ? "solid" : "soft"}
        color={vote === "up" ? "ruby" : "gray"}
        aria-label="Good pick"
        aria-pressed={vote === "up"}
        onClick={() => onVote(sku, "up")}
      >
        👍
      </IconButton>
      <IconButton
        type="button"
        variant={vote === "down" ? "solid" : "soft"}
        color={vote === "down" ? "ruby" : "gray"}
        aria-label="Not for me"
        aria-pressed={vote === "down"}
        onClick={() => onVote(sku, "down")}
      >
        👎
      </IconButton>
    </Flex>
  );
}
