import { cache } from "react";
import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { getClient, TABLE_NAME } from "../db/db";
import { GSI1_ACTIVE_PK, vehiclePK, VEHICLE_SK } from "../db/keys";
import type { Vehicle, VehicleCard } from "./types";

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

// React cache() de-dupes calls within one render pass (e.g. layout + a page both calling
// this) — no cross-request caching, no config flag needed. Cross-request caching via
// "use cache"/cacheTag is a follow-up once cacheComponents is enabled — see
// "The caching layer" in plans/dynamodb-schema.md.
export const getActiveInventory = cache(queryActiveInventory);

async function fetchVehicle(vehicleId: string): Promise<Vehicle | null> {
  const result = await getClient().send(
    new GetCommand({ TableName: TABLE_NAME, Key: { PK: vehiclePK(vehicleId), SK: VEHICLE_SK } }),
  );
  if (!result.Item) return null;

  const vehicle = { ...result.Item };
  for (const key of ["PK", "SK", "GSI1PK", "GSI1SK"]) delete vehicle[key];
  return vehicle as Vehicle;
}

// Shared by generateMetadata and the page so a detail view costs one GetItem. Works for
// SOLD/PENDING vehicles too, since they stay reachable by primary key after leaving GSI1.
export const getVehicleById = cache(fetchVehicle);
