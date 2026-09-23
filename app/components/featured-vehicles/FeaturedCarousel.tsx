"use client";

import { useEffect, useRef, useState } from "react";
import VehicleCard from "../vehicle-card/VehicleCard";
import type { VehicleCard as VehicleCardData } from "../../lib/vehicles/types";

const GAP = 16; // matches gap-4 on the carousel container

export default function FeaturedCarousel({ vehicles }: { vehicles: VehicleCardData[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  function cardStep(scroller: HTMLDivElement) {
    const card = scroller.querySelector<HTMLElement>(".carousel-item");
    return (card?.offsetWidth ?? 320) + GAP;
  }

  function scrollByCard(direction: 1 | -1) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({ left: direction * cardStep(scroller), behavior: "smooth" });
  }

  function scrollToIndex(index: number) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTo({ left: index * cardStep(scroller), behavior: "smooth" });
  }

  // Tracks which card is currently snapped so the dot indicators reflect scroll/swipe
  // position too, not just the prev/next buttons.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    function handleScroll() {
      if (!scroller) return;
      const index = Math.round(scroller.scrollLeft / cardStep(scroller));
      setActiveIndex(Math.min(Math.max(index, 0), vehicles.length - 1));
    }

    scroller.addEventListener("scroll", handleScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", handleScroll);
  }, [vehicles.length]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous vehicle"
          onClick={() => scrollByCard(-1)}
          className="btn btn-circle btn-sm shrink-0"
        >
          ❮
        </button>
        <div ref={scrollerRef} className="carousel carousel-start flex-1 gap-4 rounded-box">
          {vehicles.map((vehicle) => (
            <div
              key={vehicle.vehicleId}
              className="carousel-item w-full sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/3)]"
            >
              <VehicleCard vehicle={vehicle} />
            </div>
          ))}
        </div>
        <button
          type="button"
          aria-label="Next vehicle"
          onClick={() => scrollByCard(1)}
          className="btn btn-circle btn-sm shrink-0"
        >
          ❯
        </button>
      </div>
      <div className="flex justify-center gap-2 mt-4">
        {vehicles.map((vehicle, index) => (
          <button
            key={vehicle.vehicleId}
            type="button"
            aria-label={`Go to vehicle ${index + 1} of ${vehicles.length}`}
            aria-current={index === activeIndex}
            onClick={() => scrollToIndex(index)}
            className={`h-2 w-2 rounded-full transition-colors ${
              index === activeIndex ? "bg-primary" : "bg-base-content/30"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
