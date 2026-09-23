# FeaturedVehicles: random good-deal carousel on the home page

## Context

`app/components/featured-vehicles/FeaturedVehicles.tsx` currently exists only as daisyUI's own stock-photo carousel demo (pizza images), already wired into `app/page.tsx` (under a typo'd import name, `FeeaturedVehicles`) but showing nothing vehicle-related. The user wants it replaced with a real feature: 5 random "good deal" vehicles in a centered carousel, max-width 1028px, matching the app's existing dracula daisyUI theme.

Confirmed with the user:
- **Deal filter**: only `dealRating === "GREAT"` or `"GOOD"` are eligible (excludes `FAIR` and `null`). 23 GREAT + 47 GOOD = 70 eligible vehicles today, comfortably enough for a random pick of 5.
- **Navigation**: daisyUI's standard per-slide prev/next overlay-arrow pattern (plain anchor links to adjacent slide ids, pure CSS scroll-snap, no JS), no wraparound.

`app/page.tsx`'s `Home` is currently a plain Server Component (no `"use client"`, doesn't touch the `useVehicles()` context) — this means `FeaturedVehicles` can itself be an `async` Server Component, fetching directly from `app/lib/vehicles/repository.ts` rather than going through client-side context. This sidesteps any hydration-mismatch risk a client-computed "random" pick would otherwise create (SSR output differing from a client re-roll), and reuses the same React `cache()`-wrapped `getActiveInventory()` that `app/layout.tsx` already calls once per request — no extra DynamoDB cost.

## Implementation

### 1. `app/components/featured-vehicles/FeaturedVehicles.tsx` (full rewrite)

Async Server Component, no `"use client"` needed anywhere (data fetch, filter, and random pick all happen server-side; nav arrows are plain `<a href="#id">` fragment links relying on native scroll-snap).

Random-pick helper — partial Fisher-Yates, inline in this file (only call site today; the repo's own convention per `format.ts` is to extract shared helpers only on second use):

```ts
function pickRandom<T>(items: T[], count: number): T[] {
  const pool = [...items];
  const n = Math.min(count, pool.length);
  const result: T[] = [];
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
    result.push(pool[i]);
  }
  return result;
}
```

Unbiased, and naturally handles "fewer than 5 eligible" via `Math.min` — returns fewer rather than crashing.

Component:

```tsx
import { getActiveInventory } from "../../lib/vehicles/repository";
import VehicleCard from "../vehicle-card/VehicleCard";

const FEATURED_COUNT = 5;

function pickRandom<T>(items: T[], count: number): T[] { /* as above */ }

export default async function FeaturedVehicles() {
  const inventory = await getActiveInventory();
  const eligible = inventory.filter((v) => v.dealRating === "GREAT" || v.dealRating === "GOOD");
  const featured = pickRandom(eligible, FEATURED_COUNT);

  if (featured.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-[1028px] px-4 py-12">
      <h2 className="text-3xl font-bold mb-6">Featured Deals</h2>
      <div className="carousel carousel-center w-full gap-4 rounded-box">
        {featured.map((vehicle, index) => {
          const prev = index > 0 ? featured[index - 1] : null;
          const next = index < featured.length - 1 ? featured[index + 1] : null;
          return (
            <div key={vehicle.vehicleId} id={`featured-${vehicle.vehicleId}`} className="carousel-item relative w-80">
              <VehicleCard vehicle={vehicle} />
              {prev && (
                <a href={`#featured-${prev.vehicleId}`} aria-label="Previous vehicle"
                   className="btn btn-circle btn-sm absolute left-2 top-1/2 z-10 -translate-y-1/2">
                  ❮
                </a>
              )}
              {next && (
                <a href={`#featured-${next.vehicleId}`} aria-label="Next vehicle"
                   className="btn btn-circle btn-sm absolute right-2 top-1/2 z-10 -translate-y-1/2">
                  ❯
                </a>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

Key decisions:
- **Centered, max-width 1028px**: `mx-auto w-full max-w-[1028px] px-4 py-12` on the `<section>` — arbitrary-value class since no Tailwind scale step lands on 1028, matching how `Hero.tsx` already uses ad-hoc utility values.
- **Item width `w-80` (320px)**: content area is `1028 - 2×16(px-4) = 996px`; with `gap-4` (16px), 3 cards + 2 gaps = 992px — fits 3 full cards with a sliver of the 4th peeking at the edge as a "keep scrolling" affordance.
- **Arrows are independently absolutely-positioned** (`absolute left-2 …` / `absolute right-2 …`), not a single flex-wrapper with `justify-between` — that pattern assumes both arrows always exist (wraparound), but first/last slides here only render one, and a lone flex child would collapse to the wrong side. Each arrow sits directly on the `relative` `.carousel-item`, `z-10` so it stacks above `VehicleCard`'s `Image fill`.
- Plain `<a>`, not `next/link` — this is a same-page fragment jump for scroll-snap, not a route navigation.
- `aria-label="Previous/Next vehicle"` on the arrow glyphs for screen readers.
- `VehicleCard` (a Client Component, for its image-skeleton-loading state) renders fine as a child of this Server Component — a Server Component can freely import/render Client Components; no special handling needed.
- `id={`featured-${vehicleId}`}` — `vehicleId` is a ULID (always a valid HTML id), prefixed so it can't collide with any other element independently using the raw id.

### 2. `app/page.tsx` — fix the typo

`FeeaturedVehicles` → `FeaturedVehicles` in both the import and JSX usage. `Home` stays a plain Server Component; rendering an `async` component (`FeaturedVehicles`) from a synchronous Server Component parent is fully supported.

```tsx
import Hero from "./components/hero/Hero";
import FeaturedVehicles from "./components/featured-vehicles/FeaturedVehicles";

export default function Home() {
  return (
    <>
      <Hero />
      <FeaturedVehicles />
    </>
  );
}
```

## Follow-ups explicitly out of scope

- Click-through from a featured card to a vehicle detail page (no detail route exists yet, same pending status noted in prior plans).
- Persisting/seeding the random selection (e.g. via a URL param or cookie) so it's stable across a user's session rather than re-rolling every full page load — not requested, current behavior (fresh random pick per request) is the natural default given no caching layer wraps this route.

## Verification

1. `npm run dev`, visit `/` — confirm "Featured Deals" section renders below Hero, with 5 cards, centered, capped at 1028px wide (check via devtools box model at a wide viewport).
2. Reload a few times — confirm the 5 featured vehicles vary (random pick working) and every one shown has a GREAT or GOOD deal badge (never FAIR, never no badge).
3. Click the prev/next arrows — confirm the carousel scroll-snaps to the adjacent card; confirm the first card has no prev arrow and the last card has no next arrow.
4. `npm run lint` and `npx tsc --noEmit` — clean.
5. Confirm no extra DynamoDB round-trip: this is a code-reading check (both `app/layout.tsx` and `FeaturedVehicles.tsx` call the same `cache()`-wrapped `getActiveInventory()`), not something visible in the browser.
