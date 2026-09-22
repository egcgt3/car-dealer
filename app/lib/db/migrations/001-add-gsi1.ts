// Migration 1 — add GSI1 (the browse/filter index) to the live `car-dealer` table.
// See "Migrations" in plans/dynamodb-schema.md. Idempotent: safe to re-run.
//
// Run with: npm run db:migrate

import { DescribeTableCommand, UpdateTableCommand } from "@aws-sdk/client-dynamodb";
import { getRawClient, TABLE_NAME } from "../db";

const GSI1_PROJECTED_ATTRIBUTES = [
  "vehicleId",
  "year",
  "make",
  "model",
  "trim",
  "price",
  "previousPrice",
  "mileage",
  "bodyStyle",
  "drivetrain",
  "transmissionType",
  "fuelType",
  "exteriorColorFamily",
  "condition",
  "dealRating",
  "factoryUpgrades",
  "thumbnailUrl",
];

async function migrate() {
  const client = getRawClient();

  const { Table } = await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
  const existingIndexes = Table?.GlobalSecondaryIndexes?.map((index) => index.IndexName) ?? [];

  if (existingIndexes.includes("GSI1")) {
    console.log(`GSI1 already exists on "${TABLE_NAME}" — nothing to do.`);
    return;
  }

  console.log(`Adding GSI1 to "${TABLE_NAME}"...`);

  await client.send(
    new UpdateTableCommand({
      TableName: TABLE_NAME,
      AttributeDefinitions: [
        { AttributeName: "GSI1PK", AttributeType: "S" },
        { AttributeName: "GSI1SK", AttributeType: "S" },
      ],
      GlobalSecondaryIndexUpdates: [
        {
          Create: {
            IndexName: "GSI1",
            KeySchema: [
              { AttributeName: "GSI1PK", KeyType: "HASH" },
              { AttributeName: "GSI1SK", KeyType: "RANGE" },
            ],
            Projection: {
              ProjectionType: "INCLUDE",
              NonKeyAttributes: GSI1_PROJECTED_ATTRIBUTES,
            },
          },
        },
      ],
    }),
  );

  console.log("GSI1 creation started. New writes (e.g. app/lib/db/seed.ts) are indexed");
  console.log("immediately; DynamoDB backfills any pre-existing items in the background.");
  console.log("Poll DescribeTable until GSI1's IndexStatus is ACTIVE before querying it.");
}

migrate().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
