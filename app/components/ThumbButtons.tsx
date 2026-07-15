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
    <div className="vote-buttons">
      <button
        type="button"
        className={`vote-button${vote === "up" ? " active" : ""}`}
        aria-label="Good pick"
        aria-pressed={vote === "up"}
        onClick={() => onVote(sku, "up")}
      >
        👍
      </button>
      <button
        type="button"
        className={`vote-button${vote === "down" ? " active" : ""}`}
        aria-label="Not for me"
        aria-pressed={vote === "down"}
        onClick={() => onVote(sku, "down")}
      >
        👎
      </button>
    </div>
  );
}
