# Carvana-style vehicle card grid on `/vehicles`

## Context

`/vehicles` currently exists only as a placeholder (`app/vehicles/page.tsx`) rendering a plain `<ul>` of vehicles pulled from the `useVehicles()` context (built in a prior pass — see `plans/vehicle-inventory-context.md`). The user wants this replaced with a daisyUI Card-based grid styled like Carvana's search results screenshot, but adapted to the app's existing dracula daisyUI theme and to only what the current `VehicleCard` data model actually supports.

Two things from the reference screenshot are explicitly **excluded** (confirmed with the user):
- The heart/favorite icon — no favorites backend exists yet (`app/lib/favorites/repository.ts` is still pending per `plans/dynamodb-schema.md`).
- The "Recent" badge and "Free shipping · Get it Thursday" delivery text — no `listedAt` or delivery data exists on the `VehicleCard` projection; nothing here should be fabricated.

What *is* built from real data: a Great/Good/Fair Deal badge (from `dealRating`), a price-drop indicator (from `previousPrice` vs `price`), and a factory-upgrades chip (from `factoryUpgrades`). Verified against the live seed data that a vehicle can have **both** a non-null `dealRating` and a price drop simultaneously (e.g. vehicle `01M0ZPPX...`), so the plan below defines explicit precedence rather than treating that as a hypothetical edge case.

## Implementation

### 1. `next.config.ts` — allow-list vehicle photo host

All seeded `thumbnailUrl`s live on `loremflickr.com` (pattern `https://loremflickr.com/960/640/{bodyStyle},{make}?lock={n}`, always 960×640), which isn't allow-listed yet (only `images.unsplash.com` is, from the Hero work). Add a second remote pattern:

```ts
images: {
  remotePatterns: [
    { protocol: "https", hostname: "images.unsplash.com" },
    { protocol: "https", hostname: "loremflickr.com" },
  ],
},
```

### 2. `app/lib/vehicles/format.ts` (new)

Pure formatting/calculation helpers, no framework dependency:

- `formatPrice(amount: number): string` — `Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })`.
- `formatMileage(mileage: number): string` — `"16k miles"` style: `mileage < 1000 ? "${mileage} miles" : "${Math.round(mileage / 1000)}k miles"`.
- `estimateMonthlyPayment(price, apr = 0.069, termMonths = 72): number` — standard amortized-loan formula `P * r / (1 - (1+r)^-n)`, `r` = monthly rate. `plans/dynamodb-schema.md` explicitly says this is "computed at render... depends on rate and term" without specifying values, so 6.9% APR / 72 months are documented assumptions (comment noting they're display-only placeholders, easy to tweak), consistent with the screenshot's "$0 cash down" (no down payment subtracted from `price`). `apr`/`termMonths` are optional params, not hardcoded inline, so a future page can override them.
- `getDealRatingDisplay(dealRating): { label, badgeClass } | null` — maps `GREAT`/`GOOD`/`FAIR` → `"Great Deal"`/`"Good Deal"`/`"Fair Deal"` + `badge-success`/`badge-info`/`badge-warning` (a legible traffic-light progression on the dark dracula background; `badge-error` stays reserved for actual problems, not just "the worst of three positive labels").

### 3. `app/components/vehicle-card/VehicleCard.tsx` (new)

A plain component (no `"use client"`, no hooks) taking `{ vehicle: VehicleCard }` from `app/lib/vehicles/types.ts` — kept framework-agnostic so it's reusable from a future server-rendered context too, even though today it's only instantiated from the client `app/vehicles/page.tsx`.

Structure (daisyUI `card` + `card-body`):
- `<figure className="relative aspect-[3/2]">` wrapping a `next/image` with `fill`, `sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"` (matches the grid breakpoints below) and `className="object-cover"`. `fill` + `aspect-[3/2]` is used instead of fixed width/height because card width varies across the responsive grid; 3:2 matches the source images' native 960×640 ratio so `object-cover` never crops unexpectedly.
- **Precedence rule**: if `dealRating !== null`, show the deal badge (`absolute top-2 left-2` over the photo). Independently, if `previousPrice !== null && previousPrice > price`, always show the struck-through old price next to the current price in the price block — the two aren't mutually exclusive and neither is suppressed by the other, since they communicate different things (a curated "this is a good price" signal vs. a raw price-change fact).
- Title: `{year} {make} {model}`. Subtitle: `{trim} · {formatMileage(mileage)}`, muted via `text-base-content/70`.
- Price block: current price bold/large (`text-2xl font-bold`); if price-dropped, a `<del className="text-sm text-base-content/50">` with the old price.
- `"{formatPrice(monthlyPayment)}/mo estimated · $0 cash down"` in small muted text. No info-icon/tooltip (nothing to explain yet — skip rather than fabricate).
- Factory-upgrades chip (`badge badge-outline`) only when `factoryUpgrades > 0`: `"Includes: {formatPrice(factoryUpgrades)} in factory upgrades"`.
- No divider/footer row (would otherwise hold the excluded shipping text), no favorite icon, no click-through link (no vehicle-detail route exists yet — flag with a one-line comment, same status as the pending access-pattern-1 repository work).
- Watch the `previousPrice: number | null` narrowing when writing the JSX — compute `isPriceDrop = previousPrice !== null && previousPrice > price` and use it directly in the same expression that renders `formatPrice(previousPrice)}` so TS narrows cleanly; if it doesn't, fall back to an inline `previousPrice != null && ...` guard or a locally narrowed `const oldPrice`.

### 4. `app/vehicles/page.tsx` (rewrite in place)

Client Component (unchanged from placeholder — needs `useVehicles()`), now rendering the grid instead of a `<ul>`:

- Heading row: `<h1>Vehicles</h1>` + vehicle count, plus a small `Refresh` button (`btn btn-outline btn-sm`, `disabled={isRefreshing}`, label swaps to `"Refreshing…"`) — the context already pays the `useTransition` complexity cost for this capability per the prior plan, so surface it here rather than leaving `refresh`/`isRefreshing` unused.
- Grid: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6`, mapping `vehicles` to `<VehicleCard vehicle={v} key={v.vehicleId} />`.

### Performance note

Client-side `.map()` over ~140 cards with one `next/image` each is fine as a first pass — matches the schema doc's design intent (full cached array, filtered/rendered client-side), and `next/image` already lazy-loads non-priority images by default. No virtualization/pagination needed now; worth a one-line TODO if inventory grows well past a few hundred.

## Follow-ups explicitly out of scope

- Favorites (heart icon + backend).
- Vehicle-detail page and click-through from cards.
- "Recent" badge / delivery-estimate text (no supporting data).
- Filter/sort UI on this page (separate follow-up per `plans/dynamodb-schema.md`).

## Verification

1. `npm run dev`, visit `/vehicles` — confirm a responsive card grid renders (1 col mobile → 4 cols on wide screens), photos load (loremflickr allow-listed), no broken images.
2. Spot-check a vehicle with `dealRating` set — badge shows correct label/color. Spot-check a vehicle with `previousPrice > price` — strikethrough old price shows. Spot-check one with both (e.g. `01M0ZPPX...`) — both render together. Spot-check `factoryUpgrades > 0` — chip shows; `factoryUpgrades === 0` — chip absent.
3. Click "Refresh" — button disables and shows "Refreshing…" briefly, grid re-renders.
4. `npm run lint` and `npx tsc --noEmit` — clean, especially around the `previousPrice` null-narrowing in `VehicleCard.tsx`.
5. Resize the browser (or devtools responsive mode) through the sm/lg/xl breakpoints to confirm the grid column count changes as expected.
