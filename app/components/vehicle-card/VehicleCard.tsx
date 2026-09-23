"use client";

import { useState } from "react";
import Image from "next/image";
import type { VehicleCard as VehicleCardData } from "../../lib/vehicles/types";
import {
  estimateMonthlyPayment,
  formatMileage,
  formatPrice,
  getDealRatingDisplay,
} from "../../lib/vehicles/format";

// No click-through to a detail page yet — no vehicle-detail route exists (same pending
// status as access pattern 1 in plans/dynamodb-schema.md).
export default function VehicleCard({ vehicle }: { vehicle: VehicleCardData }) {
  const { year, make, model, trim, price, previousPrice, mileage, dealRating, factoryUpgrades, thumbnailUrl } =
    vehicle;

  const dealDisplay = getDealRatingDisplay(dealRating);
  const isPriceDrop = previousPrice !== null && previousPrice > price;
  const monthlyPayment = estimateMonthlyPayment(price);
  const [isImageLoaded, setIsImageLoaded] = useState(false);

  return (
    <div className="card bg-base-100 shadow-sm border-solid border-1 border-violet-200">
      <figure className="relative aspect-3/2">
        {!isImageLoaded && <div className="skeleton absolute inset-0 rounded-none" />}
        <Image
          src={thumbnailUrl}
          alt={`${year} ${make} ${model}`}
          fill
          sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className={`object-cover transition-opacity duration-300 ${isImageLoaded ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setIsImageLoaded(true)}
        />
        {dealDisplay && (
          <span className={`badge ${dealDisplay.badgeClass} absolute top-2 left-2`}>
            {dealDisplay.label}
          </span>
        )}
      </figure>
      <div className="card-body gap-1">
        <h2 className="card-title text-base">
          {year} {make} {model}
        </h2>
        <p className="text-sm text-base-content/70">
          {trim} · {formatMileage(mileage)}
        </p>

        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-2xl font-bold">{formatPrice(price)}</span>
          {isPriceDrop && <del className="text-sm text-base-content/50">{formatPrice(previousPrice)}</del>}
        </div>

        <p className="text-xs text-base-content/70">
          {formatPrice(monthlyPayment)}/mo estimated · $0 cash down
        </p>

        {factoryUpgrades > 0 && (
          <div className="badge badge-outline h-auto whitespace-normal py-1 text-center mt-2">
            Includes: {formatPrice(factoryUpgrades)} in factory upgrades
          </div>
        )}
      </div>
    </div>
  );
}
