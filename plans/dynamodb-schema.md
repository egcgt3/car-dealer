# DynamoDB Schema — Car Dealership

Status: proposed · Last updated: 2026-09-21

## Context

The app is a Next.js 16 dealership site. The data model is driven by two screens: a vehicle
detail page ("Vehicle Details") and a Carvana-style faceted search with filter chips, a result
count, several sort orders and a favorites heart.

The hard part is the search page: arbitrary combinations of price, mileage, year, make, body
style, drivetrain and transmission, plus a live result count. DynamoDB cannot serve that with
key-based queries alone, and the usual answer is to replicate into OpenSearch or Algolia.

**That is not necessary at this scale, and this schema is built around why.** A single
dealership's active inventory (≤5,000 vehicles) is a few megabytes. If the browse index projects
only the ~17 attributes a result card and its filters need — deliberately excluding photo arrays
and long text — the whole active inventory is roughly 1.5 MB. That is one cached query.
Filtering, sorting, counting and keyword matching then happen in the Next.js server over a plain
array, which is faster than a search-cluster round-trip and costs nothing extra.

Scope decisions for v1:

- Single dealership, ~100–5,000 vehicles
- DynamoDB only — no secondary search index
- Entities: vehicles, favorites, saved searches

## Table

One table, `car-dealer`, single-table design. On-demand billing (`PAY_PER_REQUEST`) — traffic is
low and spiky, so this removes capacity planning entirely. Point-in-time recovery on.

|                   | Partition key | Sort key |
| ----------------- | ------------- | -------- |
| **Base table**    | `PK`          | `SK`     |
| **GSI1** (browse) | `GSI1PK`      | `GSI1SK` |
| **GSI2** (opt.)   | `GSI2PK`      | `GSI2SK` |

### Key layout

| Entity       | PK                 | SK                | GSI1PK          | GSI1SK                      |
| ------------ | ------------------ | ----------------- | --------------- | --------------------------- |
| Vehicle      | `VEH#<vehicleId>`  | `#META`           | `STATUS#ACTIVE` | `PRICE#<padded>#<vehicleId>` |
| VIN guard    | `VIN#<vin>`        | `VIN#<vin>`       | —               | —                           |
| User profile | `USER#<userId>`    | `PROFILE`         | —               | —                           |
| Favorite     | `USER#<userId>`    | `FAV#<vehicleId>` | —               | —                           |
| Saved search | `USER#<userId>`    | `SEARCH#<ulid>`   | —               | —                           |

`vehicleId` is a ULID, so it sorts lexicographically by creation time. `<padded>` is the price
zero-padded to 8 digits (`00021590`) so string comparison sorts numerically.

Because every user-owned item shares the `USER#<userId>` partition, a single Query returns a
user's profile, favorites and saved searches together.

### Two design points that carry the whole schema

**GSI1 is sparse.** `GSI1PK` is written *only* while a vehicle is `ACTIVE` or `PENDING`. Marking
a car `SOLD` removes the attribute, which drops the row out of GSI1 while the full record stays
in the base table for history. The browse index therefore stays sized to current inventory
forever, no matter how many cars have been sold over the years.

**GSI1 projection is `INCLUDE`, not `ALL`.** Project exactly the card-and-filter attributes:

```
vehicleId, year, make, model, trim, price, previousPrice, mileage, bodyStyle,
drivetrain, transmissionType, fuelType, exteriorColorFamily, condition,
dealRating, factoryUpgrades, thumbnailUrl
```

This excludes `photos[]`, descriptions and option lists — the bulk of each record. Result: ~300 B
per projected item instead of ~3 KB, so 5,000 vehicles fetch in ~2 pages rather than ~10.

> Every filter chip on the search page must have its attribute in this list, or in-app filtering
> silently breaks. Adding a new filter means updating the projection.

## Vehicle attributes

Note the split between **display** strings and **filter** values. The detail page shows
`"Xtronic CVT"`, but the filter chip says "Automatic Transmission". Storing only the display
string makes that chip impossible; storing only the enum loses the real spec. Store both.

**Identity** — `vin`, `stockNumber`, `year` (N), `make`, `model`, `trim`,
`bodyStyle` (`SEDAN|SUV|TRUCK|COUPE|HATCHBACK|VAN|WAGON|CONVERTIBLE`),
`condition` (`NEW|USED|CERTIFIED`)

**Pricing** — `price` (N, whole dollars), `msrp`, `previousPrice` (drives the price-drop banner),
`factoryUpgrades` (N — the "$890 in factory upgrades" line),
`dealRating` (`GREAT|GOOD|FAIR|null` — the "Great Deal" badge).
Monthly payment estimates are *computed at render*, never stored — they depend on rate and term.

**Odometer** — `mileage` (N)

**Details** — `mpgCity`, `mpgHighway`, `drivetrain` (`FWD|RWD|AWD|4WD`), `seating` (N),
`numberOfKeys` (N), `fuelType` (`GAS|HYBRID|PLUGIN_HYBRID|ELECTRIC|DIESEL`)

| Display attribute                     | Example                 | Filter attribute(s)                           |
| ------------------------------------- | ----------------------- | --------------------------------------------- |
| `exteriorColor`                       | "Glacier White"         | `exteriorColorFamily` = `WHITE`                |
| `interiorColor` + `interiorMaterial`  | "Charcoal" + `CLOTH`    | `interiorMaterial`                             |
| `engine`                              | "2.5L I-4 DOHC"         | `engineCylinders` = 4, `engineDisplacement` = 2.5 |
| `transmission`                        | "Xtronic CVT"           | `transmissionType` = `CVT`                     |

**Media** — `photos` (List of Maps: `{url, alt, order}`), `thumbnailUrl`. Photos are embedded on
the vehicle item rather than stored as separate rows: 5–10 per car keeps the item near 3 KB, far
under the 400 KB limit, and they are always read together with the vehicle.

**Lifecycle** — `status` (`DRAFT|ACTIVE|PENDING|SOLD|ARCHIVED`), `listedAt`, `soldAt`,
`createdAt`, `updatedAt`

### VIN uniqueness

Importing a feed twice is the realistic way this data gets corrupted. Guard it with the standard
DynamoDB uniqueness pattern: write the vehicle and a `VIN#<vin>` item in one
`TransactWriteItems`, with `ConditionExpression: attribute_not_exists(PK)` on the guard. The
guard item also serves VIN lookups via `GetItem`, so no VIN index is needed.

## Access patterns

| #  | Pattern                          | Operation                                                        |
| -- | -------------------------------- | ---------------------------------------------------------------- |
| 1  | Vehicle detail page              | `GetItem PK=VEH#<id>, SK=#META`                                    |
| 2  | Look up by VIN                   | `GetItem PK=VIN#<vin>` → `vehicleId`                               |
| 3  | **Browse / filter / sort / count** | `Query` GSI1 `GSI1PK=STATUS#ACTIVE`, paginate fully, cache, filter in app |
| 4  | Create vehicle                   | `TransactWriteItems` (vehicle + VIN guard)                         |
| 5  | Update / mark sold               | `UpdateItem`; `REMOVE GSI1PK` drops it from browse                 |
| 6  | Toggle favorite                  | `PutItem` / `DeleteItem PK=USER#<id>, SK=FAV#<vid>`                |
| 7  | Is this favorited?               | `GetItem` — O(1), no scan                                          |
| 8  | List favorites                   | `Query PK=USER#<id>, SK begins_with FAV#` → `BatchGetItem` vehicles |
| 9  | Favorite count for a vehicle     | `Query` GSI2 `GSI2PK=VEH#<id>` *(optional)*                        |
| 10 | Save / list searches             | `PutItem` / `Query SK begins_with SEARCH#`                         |
| 11 | Everything for a user            | `Query PK=USER#<id>`                                               |

Favorites use `SK=FAV#<vehicleId>` rather than embedding a timestamp, so pattern 7 is a single
`GetItem` and toggling needs no prior read. Favorites lists are small (<100), so "most recently
added" sorts in the app. A favorite stores only the vehicle id and `createdAt` — never a copy of
the price — so price changes are reflected automatically.

GSI2 (`GSI2PK=VEH#<vehicleId>`, `GSI2SK=FAV#<userId>`, `KEYS_ONLY`) is only needed for "N people
are watching this car". Skip it in v1 unless that feature is wanted.

### Saved searches

`SEARCH#<ulid>` items hold a `name` ("Toyota SUVs under $30k"), a `filters` map mirroring the
filter chips, an optional `zip`, `createdAt` and a `filterHash` used to dedupe identical searches.

## The caching layer

This is what makes pattern 3 viable, so it is not optional. One cached function returns the full
active inventory as card-shaped objects; the listing page filters, sorts, counts and
keyword-matches over that array in memory. The cache is tagged and invalidated on any vehicle
write, so edits appear immediately rather than after a TTL expires.

Next 16 has Cache Components (`"use cache"`, `cacheLife`, `cacheTag`, `updateTag`). Per
`AGENTS.md`, read `node_modules/next/dist/docs/01-app/` for the current caching API before
writing this — the APIs differ from older Next versions, and this is exactly where that bites.

Keyword search ("Search make, model, or keyword") is substring matching over the cached array.
Honest limitation: no typo tolerance, no stemming. At 5,000 cars that is acceptable, but it is
the first thing users will notice missing.

## When to outgrow this

Add a search index (OpenSearch or Typesense, fed by DynamoDB Streams) when any of these hit:

- Active inventory passes ~10,000 vehicles
- The cached snapshot stops fitting comfortably in function memory
- Typo-tolerant or relevance-ranked keyword search becomes a requirement

The vehicle item shape does not change when that happens — the index is added alongside, so the
migration is additive.

## Planned implementation

- `lib/dynamodb/client.ts` — `DynamoDBDocumentClient`. On Vercel, prefer OIDC federation
  (`awsCredentialsProvider` from `@vercel/functions/oidc`) over long-lived access keys in env vars.
- `lib/dynamodb/keys.ts` — key builders and the price-padding helper, so key formats live in
  exactly one place.
- `lib/vehicles/types.ts` — `Vehicle`, `VehicleCard` (the GSI1 projection), enums.
- `lib/vehicles/repository.ts` — patterns 1–5.
- `lib/vehicles/filter.ts` — pure, dependency-free filter/sort/count over `VehicleCard[]`.
- `lib/favorites/repository.ts` — patterns 6–11.
- `scripts/create-table.ts` — `CreateTable` definition, runnable against DynamoDB Local and AWS.

## Verification

Once implemented:

1. Run DynamoDB Local in Docker; create the table with `scripts/create-table.ts`.
2. Seed ~2,000 generated vehicles with varied makes, prices and statuses.
3. Query GSI1 with `ReturnConsumedCapacity: 'TOTAL'` — confirm the full active set arrives in
   ~2 pages and that consumed RCU matches the small projection. If it is large, the `INCLUDE`
   list has drifted toward `ALL`.
4. Mark a vehicle `SOLD`; confirm it vanishes from GSI1 but `GetItem` still returns it.
5. Attempt a duplicate-VIN insert; confirm the transaction is rejected.
6. Toggle a favorite twice; confirm idempotency and that pattern 7 is a single `GetItem`.
7. Unit-test `lib/vehicles/filter.ts` against a fixed array: combined filters, each sort order,
   result counts.
