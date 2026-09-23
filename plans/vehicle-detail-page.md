# Vehicle detail page: `/vehicles/[vehicleId]`

(First implementation step: copy this file to `plans/vehicle-detail-page.md` in the project.)

## Context

Vehicle cards (`app/components/vehicle-card/VehicleCard.tsx`) are not clickable and no detail route exists; this was flagged as pending "access pattern 1" in `plans/dynamodb-schema.md`. Goal: clicking a card (grid on `/vehicles` and the home carousel) navigates to a page showing everything we store about the vehicle, grouped into sections.

The card only carries the GSI1 projection (`VehicleCard` type). The detail page needs the full record (VIN, MSRP, engine, MPG, colors, seating, all photos, dates, etc.), which is one `GetItem PK=VEH#<id>, SK=#META`, and works for SOLD vehicles too since they stay reachable outside GSI1.

## Design decisions

- **Server Component page**, fetching by `GetItem` directly, no context needed. The page must not depend on the client inventory context because a deep link/refresh has to work.
- **Next 16 specifics**: `params` is a Promise. Use the global `PageProps<"/vehicles/[vehicleId]">` helper (per `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`); `notFound()` for missing ids.
- **Wrap the fetch in React `cache()`** so `generateMetadata` and the page share one DynamoDB call (same convention as `getActiveInventory`).
- **Status handling**: SOLD/PENDING vehicles still render (shareable links stay valid) with a status alert banner ("This vehicle has been sold"); the CTA is disabled for SOLD.
- **Scope out**: real contact/purchase flow, favorites, VIN history reports. CTAs are placeholder buttons (no backend exists).

## Files

### 1. `app/lib/vehicles/types.ts` (edit)
Add `VehicleStatus = "ACTIVE" | "PENDING" | "SOLD"`, `InteriorMaterial` (values inferred from mocks, e.g. LEATHERETTE; check the set with a quick `node` scan before typing), `VehiclePhoto { url; alt; order }`, and:
```ts
export interface Vehicle extends VehicleCard {
  vin; stockNumber; msrp; mpgCity; mpgHighway; seating; numberOfKeys;
  exteriorColor; interiorColor; interiorMaterial;
  engine; engineCylinders; engineDisplacement; transmission;
  photos: VehiclePhoto[]; status: VehicleStatus;
  listedAt; soldAt: string | null; createdAt; updatedAt;
}
```

### 2. `app/lib/vehicles/repository.ts` (edit)
```ts
async function fetchVehicle(id: string): Promise<Vehicle | null> // GetCommand, key from vehiclePK(id) + VEHICLE_SK
export const getVehicleById = cache(fetchVehicle);
```
Reuse `getClient`, `TABLE_NAME` and `vehiclePK`/`VEHICLE_SK` from `app/lib/db/` (no hand-formatted keys, per `keys.ts`). Strip `PK/SK/GSI1*` attributes before returning.

### 3. `app/lib/vehicles/format.ts` (edit)
Add small helpers (extracted on second use rule: used only here plus labels): `formatEnum` (`PLUGIN_HYBRID` -> "Plug-in Hybrid" via a label map for the few irregular ones), `formatDate` (listed date / "Listed N days ago"), `formatMpg`. Reuse existing `formatPrice`, `formatMileage` (add an exact-mileage variant, `toLocaleString`, since the card's "45k miles" is too coarse here), `estimateMonthlyPayment`, `getDealRatingDisplay`.

### 4. Route files under `app/vehicles/[vehicleId]/`
- `page.tsx`: async Server Component; `const { vehicleId } = await props.params; const vehicle = await getVehicleById(vehicleId); if (!vehicle) notFound();` renders the sections below. Also `generateMetadata` -> title `"{year} {make} {model} {trim}"`, description with price/mileage.
- `not-found.tsx`: "Vehicle not found" with a link back to `/vehicles`.
- `loading.tsx`: skeleton layout (daisyUI `skeleton`) for the gallery and side panel.
- `app/vehicles/page.tsx` stays a client page; nothing changes except the cards link.

### 5. Components under `app/components/vehicle-detail/`
Layout at `lg`: two columns inside `mx-auto max-w-6xl px-4 py-8`: left (gallery + spec sections), right sticky purchase panel; single column below `lg` with the panel directly after the gallery.

| Component | Type | Contents |
|---|---|---|
| `Breadcrumbs.tsx` | server | daisyUI `breadcrumbs`: Home / Vehicles / name |
| `PhotoGallery.tsx` | **client** | large `next/image` (aspect-3/2, skeleton until onLoad as in VehicleCard, `priority` on first) + thumbnail strip; selected index in `useState`; prev/next buttons and keyboard arrows. Photos sorted by `order`. |
| `PricePanel.tsx` | server | Title (year make model), trim, deal badge (`getDealRatingDisplay`), price with `<del>` on price drop, "Save $X" vs previous price and vs MSRP, monthly estimate + $0 down note, factory-upgrades line, status banner, CTA buttons ("Check availability", "Schedule test drive"; placeholders, `btn-primary`, disabled when SOLD) |
| `SpecSection.tsx` | server | Reusable card: title + a `<dl>` grid of label/value rows; skips rows whose value is null/empty. Every section below is one instance, so the page stays declarative. |
| `KeyFacts.tsx` | server | Row of daisyUI `stats`: mileage, MPG (city/hwy), drivetrain, fuel type |

Sections rendered via `SpecSection` (in order):
1. **Overview**: condition, body style, mileage (exact), stock number, VIN, number of keys, seating
2. **Pricing**: price, MSRP, previous price, savings vs MSRP, factory upgrades, est. monthly payment (with the APR/term assumption stated, matching `format.ts`)
3. **Performance & Fuel**: engine, cylinders, displacement, transmission (+ type), drivetrain, fuel type, MPG city/hwy
4. **Exterior & Interior**: exterior color (+ family swatch dot), interior color, interior material, seating
5. **Listing details**: status, listed date / days on lot, last updated

### 6. Linking cards to the page (edit `VehicleCard.tsx`)
Wrap the card in `next/link` `href={`/vehicles/${vehicleId}`}` (whole-card click, `block`, keep focus ring via `focus-visible`). `VehicleCard` is a client component; `Link` works fine there. This covers both the grid and `FeaturedCarousel` with one change. In the carousel, confirm swipe/drag does not accidentally navigate (native scroll is not a click, so it should be fine; verify).

### 7. `next.config.ts`
No change: `images.unsplash.com` is already allowed. Optionally drop the dead `loremflickr.com` entry.

## Reused code
`getClient`/`TABLE_NAME` (`app/lib/db/db.ts`), `vehiclePK`/`VEHICLE_SK` (`app/lib/db/keys.ts`), `formatPrice`, `formatMileage`, `estimateMonthlyPayment`, `getDealRatingDisplay` (`app/lib/vehicles/format.ts`), image-skeleton pattern from `VehicleCard.tsx`.

## Verification
1. `npx tsc --noEmit` and `npm run lint` are clean (the typed `PageProps` helper generates on `next dev`/`typegen`).
2. `npm run dev`: click a card on `/vehicles` and in the home carousel; URL becomes `/vehicles/<ulid>`, all five sections show real data, no empty rows.
3. Hard refresh / open the URL directly (does not rely on context) works.
4. `/vehicles/does-not-exist` shows the not-found page (with a 404 status).
5. A SOLD vehicle (seed has 25 non-active; pick an id with `status: "SOLD"` from `app/data/mocks.json`) renders with the sold banner and a disabled CTA, though it is absent from the grid.
6. Gallery: thumbnails, arrows and keyboard change the image; check mobile width (single column) and desktop (sticky panel).
7. Confirm one `GetItem` per page view (`generateMetadata` + page share the cached call).
