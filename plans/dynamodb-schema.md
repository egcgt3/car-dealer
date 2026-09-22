# DynamoDB Schema — Car Dealership

Status: base table live, GSI1 pending · Last updated: 2026-09-21

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

## Infrastructure & environment

The table already exists — it's provisioned through Vercel's native AWS integration (the project
is linked via `.vercel/project.json`), not by a `CreateTable` script.

**Live today:**

- Table `car-dealer`, region `us-west-1`, base keys `PK` (partition) / `SK` (sort) — matches this
  schema's base table exactly.
- [app/lib/db/db.ts](../app/lib/db/db.ts) builds a `DynamoDBDocumentClient` from
  `@aws-sdk/client-dynamodb` / `@aws-sdk/lib-dynamodb`, credentialed via `awsCredentialsProvider`
  from `@vercel/functions/oidc` — OIDC federation to an AWS IAM role, no long-lived access keys.
- Env vars live in `.env.local` (gitignored, never commit). Vercel prefixes each with the linked
  resource's name, `car_dealer_`:
  - `VERCEL_OIDC_TOKEN` — local-dev OIDC token (from `vercel env pull` / `vercel dev`)
  - `car_dealer_AWS_ACCOUNT_ID`, `car_dealer_AWS_REGION`, `car_dealer_AWS_RESOURCE_ARN`, `car_dealer_AWS_ROLE_ARN`
  - `car_dealer_DYNAMODB_TABLE_NAME`, `car_dealer_DYNAMODB_TABLE_PARTITION_KEY`, `car_dealer_DYNAMODB_TABLE_SORT_KEY`

**Not live yet:** GSI1 (browse index) and GSI2 (optional favorite-count index). Only base-table
keys are exposed by the integration; nothing indicates a GSI has been created. Access pattern 3
(browse/filter/sort) is not functional until Migration 1 below runs.

**Blocked:** Migration 1 and the seed script are written (see below) and type-check cleanly, but
running either against the live table currently fails at the credential step —
`AccessDenied: Not authorized to perform sts:AssumeRoleWithWebIdentity`. The OIDC token itself is
valid (checked its `exp` claim), so this is the IAM role at `car_dealer_AWS_ROLE_ARN` not
trusting this token's issuer/audience/subject
(`...:project:car-dealer:environment:development`) — an AWS-side trust-policy configuration gap
in the Vercel↔AWS integration, not an application bug. Needs to be resolved in the AWS IAM
console (or by re-running the Vercel integration setup) before Migration 1 can actually execute.

## Migrations

Because the table is live and (eventually) holds real inventory, schema changes are **migrations
against the existing table** (`UpdateTable`), not a throwaway `CreateTable`. DynamoDB allows adding
one GSI per `UpdateTable` call; the table stays available and DynamoDB backfills the index in the
background (status `CREATING` → `ACTIVE`).

**Migration 1 — add GSI1.** Declare the two new attributes and create the index:

```ts
client.send(new UpdateTableCommand({
  TableName: "car-dealer",
  AttributeDefinitions: [
    { AttributeName: "GSI1PK", AttributeType: "S" },
    { AttributeName: "GSI1SK", AttributeType: "S" },
  ],
  GlobalSecondaryIndexUpdates: [{
    Create: {
      IndexName: "GSI1",
      KeySchema: [
        { AttributeName: "GSI1PK", KeyType: "HASH" },
        { AttributeName: "GSI1SK", KeyType: "RANGE" },
      ],
      Projection: {
        ProjectionType: "INCLUDE",
        NonKeyAttributes: [
          "vehicleId", "year", "make", "model", "trim", "price", "previousPrice",
          "mileage", "bodyStyle", "drivetrain", "transmissionType", "fuelType",
          "exteriorColorFamily", "condition", "dealRating", "factoryUpgrades", "thumbnailUrl",
        ],
      },
    },
  }],
}));
```

Key names and the projection list are unchanged from the original design — nothing to rename,
only to provision. Migration 2 (GSI2, `KEYS_ONLY`) follows the same shape later, only if the
favorite-count feature is built.

Migration scripts are idempotent (call `DescribeTable` first; skip if the index already exists)
and numbered under `app/lib/db/migrations/` so there's an ordered history of changes to a table
that now has real data, e.g. `app/lib/db/migrations/001-add-gsi1.ts`.

## Seeding

Run **after** Migration 1, not before — GSI1 needs to exist first so it backfills as the seed
data lands instead of needing a separate backfill pass afterward.

[app/lib/db/seed.ts](../app/lib/db/seed.ts) loads [app/data/mocks.json](../app/data/mocks.json)
(165 generated vehicles) and writes two items per vehicle:

- **Vehicle item** — `PK=VEH#<vehicleId>, SK=#META` plus every attribute from the mock record.
  When `status` is `ACTIVE` or `PENDING`, also set `GSI1PK=STATUS#ACTIVE` and
  `GSI1SK=PRICE#<price padded to 8 digits>#<vehicleId>`. `SOLD`/`DRAFT` vehicles get no GSI1
  attributes at all — this is the sparse-GSI1 behavior from the [Table](#table) section,
  exercised from the very first seed instead of only in later testing.
- **VIN guard item** — `PK=VIN#<vin>, SK=VIN#<vin>` pointing at the vehicle's `vehicleId`, so
  access pattern 2 (VIN lookup) works immediately.

Written with `BatchWriteItem` in batches of 25 (the DynamoDB limit): 165 vehicles × 2 items =
330 items, ~14 batches. `BatchWriteItem` has no `ConditionExpression`, so it skips the
VIN-uniqueness check that `TransactWriteItems` enforces on real writes (access pattern 4) — fine
for a one-time load of mock data with VINs already verified unique, not a pattern to reuse for
live writes.

Idempotent by construction: every write is a `PutRequest`, so rerunning the script just
overwrites the same 165 items with the same `vehicleId`s (they come from the mock file, not
regenerated per run).

Add an `npm` script for convenience: `"db:seed": "tsx app/lib/db/seed.ts"` (or whatever runner
the migration scripts use — keep both consistent).

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
| 3  | **Browse / filter / sort / count** | `Query` GSI1 `GSI1PK=STATUS#ACTIVE`, paginate fully, cache, filter in app — ⚠ pending Migration 1 |
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

## Implementation

Paths follow the `app/lib/...` convention already started, not the originally-guessed
`lib/dynamodb/...`.

**Done (code written, type-checks and lints clean):**

- [app/lib/db/db.ts](../app/lib/db/db.ts) — `DynamoDBDocumentClient` via OIDC federation
  (`awsCredentialsProvider` from `@vercel/functions/oidc`), plus `getRawClient()` (for
  administrative commands the document client doesn't wrap) and the `TABLE_NAME` constant.
- [app/lib/db/keys.ts](../app/lib/db/keys.ts) — key builders and the price-padding helper, so
  key formats live in exactly one place.
- [app/lib/db/migrations/001-add-gsi1.ts](../app/lib/db/migrations/001-add-gsi1.ts) — Migration 1.
  Run with `npm run db:migrate`. ⚠ Not yet successfully run — see "Blocked" above.
- [app/lib/db/seed.ts](../app/lib/db/seed.ts) — the Seeding script above. Run with
  `npm run db:seed`, after `db:migrate`. ⚠ Same blocker; untested end-to-end.
- `package.json` — `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@vercel/functions`,
  `tsx` (dev, to run the scripts above), plus `db:migrate` / `db:seed` scripts.
- `.env.local` — table connection info (gitignored).

**Pending:**

- `app/lib/vehicles/types.ts` — `Vehicle`, `VehicleCard` (the GSI1 projection), enums.
- `app/lib/vehicles/repository.ts` — patterns 1–5.
- `app/lib/vehicles/filter.ts` — pure, dependency-free filter/sort/count over `VehicleCard[]`.
- `app/lib/favorites/repository.ts` — patterns 6–11.

## Verification

1. Run Migration 1 (`app/lib/db/migrations/001-add-gsi1.ts`) against a DynamoDB Local table first;
   confirm `DescribeTable` shows `GSI1` as `ACTIVE`.
2. Run Migration 1 against the real `car-dealer` table the same way.
3. Run `app/lib/db/seed.ts` against that table; confirm 330 items landed (165 vehicles + 165 VIN
   guards).
4. Query GSI1 with `ReturnConsumedCapacity: 'TOTAL'` — confirm exactly 140 items come back (the
   mock file's `ACTIVE` + `PENDING` count), arriving in ~1 page, and that consumed RCU matches
   the small projection. If the count is 165 instead of 140, the sparse-GSI1 write in the seed
   script is wrong; if RCU is high, the `INCLUDE` list has drifted toward `ALL`.
5. Mark a vehicle `SOLD`; confirm it vanishes from GSI1 but `GetItem` still returns it.
6. Attempt a duplicate-VIN insert; confirm the transaction is rejected.
7. Toggle a favorite twice; confirm idempotency and that pattern 7 is a single `GetItem`.
8. Unit-test `app/lib/vehicles/filter.ts` against a fixed array: combined filters, each sort
   order, result counts.
