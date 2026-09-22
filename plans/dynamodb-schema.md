# DynamoDB Schema — Car Dealership

Status: table, GSI1, and seed data all live and verified · Last updated: 2026-09-22

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

One table, `car-dealership`, single-table design. **Design intent** is on-demand billing
(`PAY_PER_REQUEST`) — traffic is low and spiky, so this removes capacity planning entirely — with
point-in-time recovery on. **Actual live table** is PROVISIONED (5 RCU / 5 WCU), because it was
created manually through the AWS Console rather than by a script honoring this design; see
"Infrastructure & environment" below. Worth switching to on-demand once things settle.

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

**Superseded design, kept for context:** the table was originally provisioned through Vercel's
native AWS integration as `car-dealer`, with [app/lib/db/db.ts](../app/lib/db/db.ts)
credentialed via `awsCredentialsProvider` from `@vercel/functions/oidc` (OIDC federation to an
AWS IAM role, no long-lived keys) — the pattern this doc originally recommended. That's abandoned
now: the IAM role's trust policy rejected the OIDC token
(`AccessDenied: Not authorized to perform sts:AssumeRoleWithWebIdentity`, confirmed not a token
expiry issue), fixing it requires AWS IAM console access this account doesn't have, and there was
no path to grant that access. Rather than stay blocked, the table and credentials were rebuilt
manually.

**Live today:**

- Table `car-dealership`, region `us-west-1`, base keys `PK` (partition) / `SK` (sort) — matches
  this schema's base table, created manually through the AWS Console (see the billing-mode note
  under [Table](#table)).
- IAM user `gerry-dynamodb`, authenticated with a static access key — no OIDC, no role
  assumption. This is a deliberate step down from the original OIDC design; it works around the
  trust-policy dead end but means a long-lived credential now lives in `.env.local`. Rotate it
  periodically, and don't reuse this pattern for anything that isn't a single-developer project.
- [app/lib/db/db.ts](../app/lib/db/db.ts) builds the `DynamoDBDocumentClient` directly from that
  static key — used by both the app runtime and the migration/seed scripts now; there's no
  separate admin-vs-app credential split anymore.
- Env vars live in `.env.local` (gitignored, never commit):
  `DYNAMODB_ACCESS_KEY_ID`, `DYNAMODB_SECRET_ACCESS_KEY`, `DYNAMODB_REGION`, `DYNAMODB_TABLE_NAME`.
  Deliberately **not** named `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` — those
  exact names are reserved by the AWS Lambda runtime Vercel Functions run on, and get silently
  replaced with Lambda's own execution-role credentials in production if used, which would break
  DynamoDB auth in a very confusing way. Keep using the `DYNAMODB_*` names if this ever gets
  redeployed.
- GSI1 was created by running `npm run db:migrate` against this new static-credential setup —
  the first successful run of Migration 1, once the OIDC trust-policy dead end was routed
  around. The table is PROVISIONED (not the design's intended PAY_PER_REQUEST), so the script
  detects that and matches the GSI's throughput to the base table's 5 RCU / 5 WCU rather than
  erroring; see [Migration 1](#migrations) below. As of this writing it's still `CREATING` —
  confirm with `npm run db:migrate` again once it's had time to finish; it's idempotent, so on an
  already-`ACTIVE` index it just prints "nothing to do" rather than erroring.

## Migrations

Because the table is live and (eventually) holds real inventory, schema changes are **migrations
against the existing table** (`UpdateTable`), not a throwaway `CreateTable`. DynamoDB allows adding
one GSI per `UpdateTable` call; the table stays available and DynamoDB backfills the index in the
background (status `CREATING` → `ACTIVE`).

**Migration 1 — add GSI1.** Declare the two new attributes and create the index:

```ts
client.send(new UpdateTableCommand({
  TableName: "car-dealership",
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
      // Only needed because the live table is PROVISIONED, not the design's intended
      // PAY_PER_REQUEST — see the "Table" section. The script reads the base table's
      // current throughput and matches it here rather than hardcoding a number; DynamoDB
      // rejects this field entirely on an on-demand table.
      ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
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
regenerated per run) — confirmed in practice: the first live run got throttled partway through
and was simply re-run to completion.

**Throttling on a PROVISIONED table.** On the live table's 5 WCU (see the billing-mode note
under [Table](#table)), a `BatchWriteItem` call can fail outright with
`ProvisionedThroughputExceededException` once burst credit runs out, rather than returning
`UnprocessedItems`. `writeBatch` catches that specific exception and retries the same request
with exponential backoff (1s, 2s, 4s, ... capped at 15s), and the main loop adds a 300ms pacing
gap between batches. On an on-demand table this code path is simply never exercised.

`npm run db:seed` runs `tsx --env-file=.env.local app/lib/db/seed.ts` — the `--env-file` flag
matters: `tsx` doesn't load `.env.local` automatically the way `next dev`/`build` do, so without
it every `process.env.DYNAMODB_*` read is `undefined`.

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
| 3  | **Browse / filter / sort / count** | `Query` GSI1 `GSI1PK=STATUS#ACTIVE`, paginate fully, cache, filter in app — ✅ verified: 140 items, 7 RCU total |
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

- [app/lib/db/db.ts](../app/lib/db/db.ts) — `DynamoDBDocumentClient` via a static IAM user
  credential (see "Infrastructure & environment" above), plus `getRawClient()` (for
  administrative commands the document client doesn't wrap) and the `TABLE_NAME` constant.
- [app/lib/db/keys.ts](../app/lib/db/keys.ts) — key builders and the price-padding helper, so
  key formats live in exactly one place.
- [app/lib/db/migrations/001-add-gsi1.ts](../app/lib/db/migrations/001-add-gsi1.ts) — Migration 1.
  Run with `npm run db:migrate`. ✅ Run against `car-dealership`; GSI1 reached `ACTIVE` (took
  ~5.5 minutes on an empty table — normal DynamoDB latency, not data-size-dependent).
- [app/lib/db/seed.ts](../app/lib/db/seed.ts) — the Seeding script above, now with
  exponential-backoff retry on `ProvisionedThroughputExceededException` (the table's 5 WCU
  throttled partway through the first run — a hard exception, not the `UnprocessedItems` case
  the original retry loop handled) plus a 300ms pacing gap between batches. Run with
  `npm run db:seed`, after GSI1 reaches `ACTIVE`. ✅ Run successfully: 330 items written, 140
  confirmed queryable via GSI1 (matches the mock file's ACTIVE+PENDING count exactly), and a
  spot-checked SOLD vehicle confirmed to have no GSI1PK/GSI1SK while still reachable via GetItem.
- `package.json` — `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `tsx` (dev, to run the
  scripts above), plus `db:migrate` / `db:seed` scripts (both pass `--env-file=.env.local`,
  since `tsx` doesn't load it automatically the way `next dev`/`build` do).
- `.env.local` — table connection info (gitignored).

**Pending:**

- `app/lib/vehicles/types.ts` — `Vehicle`, `VehicleCard` (the GSI1 projection), enums.
- `app/lib/vehicles/repository.ts` — patterns 1–5.
- `app/lib/vehicles/filter.ts` — pure, dependency-free filter/sort/count over `VehicleCard[]`.
- `app/lib/favorites/repository.ts` — patterns 6–11.

## Verification

Steps 1–3 have been run against the live `car-dealership` table and confirmed:

1. ✅ `npm run db:migrate` — `DescribeTable` shows `GSI1` as `ACTIVE` (took ~5.5 minutes to
   provision on an empty table).
2. ✅ `npm run db:seed` — 330 items landed (165 vehicles + 165 VIN guards); a base-table `Scan`
   with `Select: COUNT` confirms 330.
3. ✅ Queried GSI1 (`GSI1PK=STATUS#ACTIVE`) with `ReturnConsumedCapacity: 'TOTAL'` — exactly 140
   items came back (the mock file's `ACTIVE` + `PENDING` count), in a single page, at 7 RCU
   total for the whole scan — confirms the `INCLUDE` projection is doing its job rather than
   drifting toward `ALL`. Also spot-checked one `SOLD` vehicle directly: no `GSI1PK`/`GSI1SK` on
   the item, but `GetItem` still returns it — the sparse-GSI1 design is working as intended.

Not yet run (need the pending `app/lib/vehicles/*` and `app/lib/favorites/*` modules first):

4. Mark a vehicle `SOLD`; confirm it vanishes from GSI1 but `GetItem` still returns it.
5. Attempt a duplicate-VIN insert; confirm the transaction is rejected.
6. Toggle a favorite twice; confirm idempotency and that pattern 7 is a single `GetItem`.
7. Unit-test `app/lib/vehicles/filter.ts` against a fixed array: combined filters, each sort
   order, result counts.
