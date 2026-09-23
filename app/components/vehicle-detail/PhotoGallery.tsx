"use client";

import { useState } from "react";
import Image from "next/image";
import type { VehiclePhoto } from "../../lib/vehicles/types";

export default function PhotoGallery({ photos, title }: { photos: VehiclePhoto[]; title: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);

  if (photos.length === 0) return null;

  const active = photos[activeIndex];
  const isLoaded = loadedUrl === active.url;

  function go(direction: 1 | -1) {
    setActiveIndex((index) => (index + direction + photos.length) % photos.length);
  }

  return (
    <div
      tabIndex={0}
      aria-label={`${title} photo gallery`}
      className="outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-box"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") go(-1);
        if (event.key === "ArrowRight") go(1);
      }}
    >
      <div className="relative aspect-3/2 overflow-hidden rounded-box bg-base-200">
        {!isLoaded && <div className="skeleton absolute inset-0 rounded-none" />}
        <Image
          key={active.url}
          src={active.url}
          alt={`${title} — photo ${activeIndex + 1} of ${photos.length}`}
          fill
          priority={activeIndex === 0}
          sizes="(min-width: 1152px) 750px, 100vw"
          className={`object-cover transition-opacity duration-300 ${isLoaded ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setLoadedUrl(active.url)}
        />
        <button
          type="button"
          aria-label="Previous photo"
          onClick={() => go(-1)}
          className="btn btn-circle btn-sm absolute left-2 top-1/2 -translate-y-1/2"
        >
          ❮
        </button>
        <button
          type="button"
          aria-label="Next photo"
          onClick={() => go(1)}
          className="btn btn-circle btn-sm absolute right-2 top-1/2 -translate-y-1/2"
        >
          ❯
        </button>
        <span className="badge badge-neutral absolute bottom-2 right-2">
          {activeIndex + 1} / {photos.length}
        </span>
      </div>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {photos.map((photo, index) => (
          <button
            key={`${photo.order}-${photo.url}`}
            type="button"
            aria-label={`Show photo ${index + 1}`}
            aria-current={index === activeIndex}
            onClick={() => setActiveIndex(index)}
            className={`relative aspect-3/2 w-24 shrink-0 overflow-hidden rounded-md border-2 ${
              index === activeIndex ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"
            }`}
          >
            <Image src={photo.url} alt="" fill sizes="96px" className="object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
