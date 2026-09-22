# Fetch DynamoDB inventory in a Server Component, expose via React Context

## Context

The DynamoDB side of this project is fully built out (`app/lib/db/db.ts`, `app/lib/db/keys.ts`, the GSI1 migration, and 165 seeded vehicles — 140 of them ACTIVE/PENDING and queryable via GSI1), but nothing in `app/` actually reads from it yet. `app/page.tsx` is still create-next-app boilerplate. The schema plan (`plans/dynamodb-schema.md`) explicitly lists `app/lib/vehicles/types.ts` and `app/lib/vehicles/repository.ts` as pending work.

The goal here is the first slice of that: fetch the active-inventory listing (access pattern 3 — `Query` GSI1 where `GSI1PK=STATUS#ACTIVE`, paginated) and make it available through React Context so any page can read it, without a client-side loading flash on first paint and without touching Cache Components / `next.config.ts` (that's a bigger, app-wide flag flip — out of scope for this pass, noted as a follow-up).

Two decisions the user confirmed:
- **Load strategy**: `app/layout.tsx` (Server Component) fetches the initial data directly during render and hydrates a Client Component Context Provider with it. A separate `'use server'` action exists only for later client-triggered refreshes (e.g. a refresh button), not for the initial load — this avoids the fetch-then-flash waterfall a naive "fetch in a server action on mount" approach would cause.
- **Scope**: active-inventory listing only (`VehicleCard[]`). No vehicle-detail-by-id, no filter/sort, no favorites — those stay pending per the schema doc.

## Implementation

### 1. `app/lib/vehicles/types.ts` (new)

`VehicleCard` — exactly the GSI1 `INCLUDE` projection, nothing more — plus the enum unions it needs, sourced from `plans/dynamodb-schema.md`'s "Vehicle attributes" section (`bodyStyle`, `drivetrain`, `condition`, `fuelType`, `dealRating` are explicitly enumerated there) and cross-checked against `app/data/mocks.json` for the two fields the doc doesn't enumerate (`transmissionType`, `exteriorColorFamily`):

```ts
export type BodyStyle = "SEDAN" | "SUV" | "TRUCK" | "COUPE" | "HATCHBACK" | "VAN" | "WAGON" | "CONVERTIBLE";
export type Drivetrain = "FWD" | "RWD" | "AWD" | "4WD";
export type TransmissionType = "AUTOMATIC" | "MANUAL" | "CVT" | "SINGLE_SPEED";
export type FuelType = "GAS" | "HYBRID" | "PLUGIN_HYBRID" | "ELECTRIC" | "DIESEL";
export type ExteriorColorFamily = "WHITE" | "BLACK" | "SILVER" | "GRAY" | "RED" | "BLUE" | "GREEN" | "BROWN";
export type Condition = "NEW" | "USED" | "CERTIFIED";
export type DealRating = "GREAT" | "GOOD" | "FAIR" | null;

export interface VehicleCard {
  vehicleId: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  previousPrice: number | null;
  mileage: number;
  bodyStyle: BodyStyle;
  drivetrain: Drivetrain;
  transmissionType: TransmissionType;
  fuelType: FuelType;
  exteriorColorFamily: ExteriorColorFamily;
  condition: Condition;
  dealRating: DealRating;
  factoryUpgrades: number;
  thumbnailUrl: string;
}
```

Note in a comment that `transmissionType`/`exteriorColorFamily` are inferred from a 165-row sample, not a documented exhaustive domain — a real inventory may widen them later.

### 2. `app/lib/vehicles/repository.ts` (new)

Paginated GSI1 query, wrapped in React's `cache()` (same-render de-dupe only, no config flag, no cross-request persistence):

```ts
import { cache } from "react";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { getClient, TABLE_NAME } from "../db/db";
import { GSI1_ACTIVE_PK } from "../db/keys";
import type { VehicleCard } from "./types";

async function queryActiveInventory(): Promise<VehicleCard[]> {
  const client = getClient();
  const items: VehicleCard[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await client.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": GSI1_ACTIVE_PK },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    items.push(...((result.Items as VehicleCard[] | undefined) ?? []));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey !== undefined);

  return items;
}

export const getActiveInventory = cache(queryActiveInventory);
```

No try/catch — this is server-only code with no user input to validate, consistent with `db.ts`/`seed.ts`. Let it throw; the caller (layout render) decides what happens.

### 3. `app/lib/vehicles/actions.ts` (new — first `'use server'` file in the repo)

```ts
"use server";

import { getActiveInventory } from "./repository";
import type { VehicleCard } from "./types";

export async function refreshActiveInventory(): Promise<VehicleCard[]> {
  return getActiveInventory();
}
```

Kept in a separate file from `repository.ts` so the Server Component layout can import the repository directly without pulling in Server Action wrapping, and so future non-card repository functions (detail lookup, create, update — patterns 1, 4, 5) don't get accidentally exposed as actions when they're added later.

### 4. `app/lib/vehicles/vehicle-context.tsx` (new, Client Component)

Context + provider + hook in one file (no split needed at this size):

```tsx
"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { refreshActiveInventory } from "./actions";
import type { VehicleCard } from "./types";

interface VehicleContextValue {
  vehicles: VehicleCard[];
  isRefreshing: boolean;
  refresh: () => void;
}

const VehicleContext = createContext<VehicleContextValue | null>(null);

export function VehicleProvider({ initialVehicles, children }: { initialVehicles: VehicleCard[]; children: ReactNode }) {
  const [vehicles, setVehicles] = useState(initialVehicles);
  const [isPending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      try {
        setVehicles(await refreshActiveInventory());
      } catch (err) {
        console.error("Failed to refresh vehicle inventory:", err);
      }
    });
  }

  return (
    <VehicleContext.Provider value={{ vehicles, isRefreshing: isPending, refresh }}>
      {children}
    </VehicleContext.Provider>
  );
}

export function useVehicles(): VehicleContextValue {
  const ctx = useContext(VehicleContext);
  if (!ctx) throw new Error("useVehicles must be used within a VehicleProvider");
  return ctx;
}
```

`initialVehicles` seeds `useState` directly — that's what avoids the loading flash. `refresh()` wraps the action call in `startTransition` per the Next.js Server Actions doc's guidance for event-handler-triggered actions. The try/catch keeps a failed background refresh from surfacing as an uncaught error.

### 5. `app/layout.tsx` — fetch + mount provider

Becomes `async`; fetches once per server render, wraps `{children}`:

```tsx
import { getActiveInventory } from "./lib/vehicles/repository";
import { VehicleProvider } from "./lib/vehicles/vehicle-context";
// ...existing font/metadata imports unchanged...

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const vehicles = await getActiveInventory();

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <VehicleProvider initialVehicles={vehicles}>{children}</VehicleProvider>
      </body>
    </html>
  );
}
```

Because the root layout stays mounted across client-side navigations in the App Router, this fetch happens once per full page load — navigating between pages reuses the same context state without refetching.

### 6. `app/page.tsx` — minimal proof of wiring

Becomes a Client Component (needs the context hook); drops the dead unused `Image` import:

```tsx
"use client";

import { useVehicles } from "./lib/vehicles/vehicle-context";

export default function Home() {
  const { vehicles, isRefreshing, refresh } = useVehicles();

  return (
    <>
      <h1>Gerardo&apos;s Car Dealership</h1>
      <p>{vehicles.length} vehicles in inventory</p>
      <button onClick={refresh} disabled={isRefreshing}>
        {isRefreshing ? "Refreshing…" : "Refresh"}
      </button>
      <ul>
        {vehicles.map((v) => (
          <li key={v.vehicleId}>
            {v.year} {v.make} {v.model} — ${v.price.toLocaleString()}
          </li>
        ))}
      </ul>
    </>
  );
}
```

Intentionally throwaway/proof-only — no styling, no card component. The real listing page (with filter/sort) is a separate follow-up.

### Error & empty-state handling

- **If the DynamoDB query throws during `app/layout.tsx`'s render**: let it throw. There's no `app/global-error.tsx` today, and a root-layout error can only be caught by that file (segment-level `error.tsx` can't cover the root layout that renders it). Do **not** silently fall back to `initialVehicles: []` on a fetch error — that would make a real outage indistinguishable from "zero cars in inventory." A friendlier `global-error.tsx` is a reasonable fast-follow, not required now.
- **Empty inventory** (legitimately zero active vehicles) needs no special handling beyond what `page.tsx` already does.
- **Refresh failures** are logged via `console.error` and swallowed, keeping the stale list — no `error` field in the context yet; add one when a real UI needs to surface it.

## Follow-ups explicitly out of scope

- Cross-request caching via `"use cache"` + `cacheTag` (requires `cacheComponents: true` in `next.config.ts` — an app-wide behavior change).
- Vehicle-detail-by-id fetch (access pattern 1) and its own context/route.
- Filter/sort logic (`app/lib/vehicles/filter.ts`) and the real search/listing page.
- Favorites (`app/lib/favorites/repository.ts`).
- `app/global-error.tsx` for a production-friendly failure page.

## Verification

1. `npm run dev`, load `/` — confirm the page renders a vehicle count and a list without a loading flash (data present on first paint, view source / disable JS to confirm it's server-rendered).
2. Click "Refresh" — confirm the button shows "Refreshing…" briefly and the list re-renders (a network tab check shows exactly one POST to the action, not a GET).
3. Navigate away and back (once a second route exists, or via a manual `router.refresh()` test) — confirm the context doesn't refetch on client-side navigation, only on a full reload.
4. `npm run lint` — clean (no unused imports, correct `"use client"`/`"use server"` boundaries).
5. Temporarily break `DYNAMODB_TABLE_NAME` in `.env.local` and reload — confirm the app fails loudly (Next error overlay / 500), not silently with an empty list, then revert.
