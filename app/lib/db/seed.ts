// Seeds the live table from app/data/mocks.json. See "Seeding" in
// plans/dynamodb-schema.md. Run AFTER app/lib/db/migrations/001-add-gsi1.ts,
// so GSI1 already exists and indexes these writes as they land.
//
// Run with: npm run db:seed

import { readFileSync } from "node:fs";
import path from "node:path";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { getClient, TABLE_NAME } from "./db";
import { GSI1_ACTIVE_PK, gsi1SortKey, vehiclePK, VEHICLE_SK, vinKey } from "./keys";

type VehicleStatus = "DRAFT" | "ACTIVE" | "PENDING" | "SOLD" | "ARCHIVED";

interface MockVehicle {
  vehicleId: string;
  vin: string;
  status: VehicleStatus;
  price: number;
  [key: string]: unknown;
}

const MOCKS_PATH = path.join(process.cwd(), "app/data/mocks.json");
const BATCH_SIZE = 25; // DynamoDB BatchWriteItem limit

function buildItems(vehicle: MockVehicle): Record<string, unknown>[] {
  const isBrowsable = vehicle.status === "ACTIVE" || vehicle.status === "PENDING";

  const vehicleItem: Record<string, unknown> = {
    ...vehicle,
    PK: vehiclePK(vehicle.vehicleId),
    SK: VEHICLE_SK,
  };

  if (isBrowsable) {
    vehicleItem.GSI1PK = GSI1_ACTIVE_PK;
    vehicleItem.GSI1SK = gsi1SortKey(vehicle.price, vehicle.vehicleId);
  }

  // VIN guard item — powers access pattern 2 (GetItem by VIN). Written with the same
  // BatchWriteItem call as the vehicle; unlike TransactWriteItems (used for real writes,
  // access pattern 4) this has no ConditionExpression, so it doesn't enforce uniqueness.
  // Fine here: the mock VINs are already verified unique.
  const vinGuardItem: Record<string, unknown> = {
    PK: vinKey(vehicle.vin),
    SK: vinKey(vehicle.vin),
    vehicleId: vehicle.vehicleId,
  };

  return [vehicleItem, vinGuardItem];
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isThrottlingError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "ProvisionedThroughputExceededException" || err.name === "ThrottlingException")
  );
}

async function writeBatch(client: DynamoDBDocumentClient, batch: Record<string, unknown>[]) {
  let requestItems: Record<string, { PutRequest: { Item: Record<string, unknown> } }[]> = {
    [TABLE_NAME]: batch.map((Item) => ({ PutRequest: { Item } })),
  };
  let attempt = 0;

  while (Object.keys(requestItems).length > 0) {
    try {
      // UnprocessedItems (partial success, no exception) is the normal case DynamoDB
      // documents; retry those directly.
      const result = await client.send(new BatchWriteCommand({ RequestItems: requestItems }));
      requestItems = (result.UnprocessedItems as typeof requestItems) ?? {};
      attempt = 0;
    } catch (err) {
      // On a PROVISIONED table (see plans/dynamodb-schema.md — the live table deviates
      // from the design's intended on-demand billing), a whole BatchWriteItem call can
      // also fail outright with ProvisionedThroughputExceededException once burst credit
      // runs out, rather than returning UnprocessedItems. Back off and retry the same
      // request instead of treating it as fatal.
      if (!isThrottlingError(err)) throw err;
      attempt += 1;
      const delayMs = Math.min(1000 * 2 ** attempt, 15000);
      console.log(`    throttled, retrying in ${delayMs}ms (attempt ${attempt})...`);
      await sleep(delayMs);
    }
  }
}

async function seed() {
  const vehicles: MockVehicle[] = JSON.parse(readFileSync(MOCKS_PATH, "utf8"));
  const client = getClient();

  const items = vehicles.flatMap(buildItems);
  const batches = chunk(items, BATCH_SIZE);

  console.log(
    `Seeding ${vehicles.length} vehicles (${items.length} items) into "${TABLE_NAME}" in ${batches.length} batches...`,
  );

  for (const [i, batch] of batches.entries()) {
    await writeBatch(client, batch);
    console.log(`  batch ${i + 1}/${batches.length} written`);
    // Small pacing gap so batches don't lean straight on the table's 5 WCU/5 RCU
    // provisioned capacity back-to-back (see the throttling note in writeBatch).
    if (i < batches.length - 1) await sleep(300);
  }

  const browsable = vehicles.filter((v) => v.status === "ACTIVE" || v.status === "PENDING").length;
  console.log(`Done. ${vehicles.length} vehicles + ${vehicles.length} VIN guards written.`);
  console.log(`${browsable} vehicles are ACTIVE/PENDING and should be visible via GSI1.`);
}

seed().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
