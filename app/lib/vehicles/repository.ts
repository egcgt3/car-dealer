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

// React cache() de-dupes calls within one render pass (e.g. layout + a page both calling
// this) — no cross-request caching, no config flag needed. Cross-request caching via
// "use cache"/cacheTag is a follow-up once cacheComponents is enabled — see
// "The caching layer" in plans/dynamodb-schema.md.
export const getActiveInventory = cache(queryActiveInventory);
