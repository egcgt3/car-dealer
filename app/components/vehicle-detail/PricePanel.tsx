import type { Vehicle } from "../../lib/vehicles/types";
import { estimateMonthlyPayment, formatPrice, getDealRatingDisplay } from "../../lib/vehicles/format";

export default function PricePanel({ vehicle }: { vehicle: Vehicle }) {
  const { year, make, model, trim, price, previousPrice, msrp, factoryUpgrades, dealRating, status } = vehicle;
  const dealDisplay = getDealRatingDisplay(dealRating);
  const priceDrop = previousPrice !== null && previousPrice > price ? previousPrice - price : 0;
  const belowMsrp = msrp > price ? msrp - price : 0;
  const isSold = status === "SOLD";

  return (
    <aside className="card bg-base-100 shadow-sm border-solid border-1 border-violet-200 lg:sticky lg:top-4">
      <div className="card-body gap-3">
        {status === "SOLD" && (
          <div role="alert" className="alert alert-error alert-soft">
            This vehicle has been sold.
          </div>
        )}
        {status === "PENDING" && (
          <div role="alert" className="alert alert-warning alert-soft">
            Sale pending — another buyer has this vehicle on hold.
          </div>
        )}

        <div>
          <p className="text-sm text-base-content/70">
            {vehicle.condition === "NEW" ? "New" : vehicle.condition === "CERTIFIED" ? "Certified" : "Used"}
          </p>
          <h1 className="text-2xl font-bold">
            {year} {make} {model}
          </h1>
          <p className="text-base-content/70">{trim}</p>
        </div>

        {dealDisplay && <span className={`badge ${dealDisplay.badgeClass}`}>{dealDisplay.label}</span>}

        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold">{formatPrice(price)}</span>
          {priceDrop > 0 && <del className="text-base-content/50">{formatPrice(previousPrice!)}</del>}
        </div>
        <ul className="text-sm text-success">
          {priceDrop > 0 && <li>Price drop of {formatPrice(priceDrop)}</li>}
          {belowMsrp > 0 && <li>{formatPrice(belowMsrp)} below MSRP</li>}
        </ul>

        <p className="text-sm text-base-content/70">
          {formatPrice(estimateMonthlyPayment(price))}/mo estimated · $0 cash down
        </p>
        {factoryUpgrades > 0 && (
          <p className="text-sm">Includes {formatPrice(factoryUpgrades)} in factory upgrades</p>
        )}

        <div className="card-actions flex-col">
          <button type="button" className="btn btn-primary w-full" disabled={isSold}>
            Check availability
          </button>
          <button type="button" className="btn btn-outline w-full" disabled={isSold}>
            Schedule test drive
          </button>
        </div>
      </div>
    </aside>
  );
}
