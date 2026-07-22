import { Card } from "@radix-ui/themes";
import {
  Deal,
  NearbyStore,
  Vote,
  centsToDollars,
  formatBottleInfo,
  lastCategorySegment,
  nearestInStockStore,
} from "@/lib/deals";
import { ThumbButtons } from "./ThumbButtons";

export function DealCard({
  deal,
  nearbyStores,
  radiusKm,
  vote,
  onVote,
}: {
  deal: Deal;
  nearbyStores: NearbyStore[];
  radiusKm: number;
  vote: Vote | undefined;
  onVote: (sku: string, vote: Vote) => void;
}) {
  const match = nearbyStores.length > 0 ? nearestInStockStore(deal, nearbyStores) : null;
  const bottleInfo = formatBottleInfo(deal);

  return (
    <Card asChild size="2" className="deal">
      <li>
        <div className="thumb-wrap">
          <img className="thumb" src={deal.thumbnailUrl ?? ""} alt="" loading="lazy" />
        </div>
        <h3>{deal.name}</h3>
        <p className="category">{lastCategorySegment(deal.category)}</p>
        {bottleInfo ? <p className="bottle-info">{bottleInfo}</p> : null}
        <p className="price">
          {centsToDollars(deal.priceInCents)}{" "}
          {deal.regularPriceInCents ? (
            <span className="regular-price">{centsToDollars(deal.regularPriceInCents)}</span>
          ) : null}
        </p>
        <p className="badges">
          {deal.isNew ? <span className="badge badge-new">New today</span> : null}
          {deal.discountPercent ? <span className="badge badge-discount">-{deal.discountPercent}%</span> : null}
          {deal.priceDropped ? <span className="badge badge-drop">Price drop</span> : null}
          {deal.nearHistoricalLow ? <span className="badge badge-low">Near all-time low</span> : null}
        </p>
        {nearbyStores.length > 0 ? (
          match ? (
            <p className="stock in-stock">
              In stock at {match.store.name} ({match.distanceKm.toFixed(1)} km)
            </p>
          ) : (
            <p className="stock out-of-stock">Not in stock within {radiusKm} km</p>
          )
        ) : null}
        <ThumbButtons sku={deal.sku} vote={vote} onVote={onVote} />
      </li>
    </Card>
  );
}
