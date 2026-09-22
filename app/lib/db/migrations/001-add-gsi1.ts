// Migration 1 — add GSI1 (the browse/filter index) to the live table (DYNAMODB_TABLE_NAME).
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

  // The schema design assumes PAY_PER_REQUEST (see "Table" in the schema doc), which needs
  // no ProvisionedThroughput on a new GSI. A manually created table may be PROVISIONED
  // instead — DynamoDB requires an explicit throughput for the GSI in that case, so match
  // whatever the base table is already using rather than guessing a number.
  const isProvisioned = Table?.ProvisionedThroughput?.ReadCapacityUnits !== undefined
    && Table.ProvisionedThroughput.ReadCapacityUnits > 0;

  if (isProvisioned) {
    console.log(
      `"${TABLE_NAME}" is PROVISIONED (${Table!.ProvisionedThroughput!.ReadCapacityUnits} RCU / ` +
        `${Table!.ProvisionedThroughput!.WriteCapacityUnits} WCU), not PAY_PER_REQUEST as the ` +
        `schema design assumes. Matching GSI1's throughput to the base table for now — consider ` +
        `switching the table to on-demand billing to match the design.`,
    );
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
            ...(isProvisioned
              ? {
                  ProvisionedThroughput: {
                    ReadCapacityUnits: Table!.ProvisionedThroughput!.ReadCapacityUnits!,
                    WriteCapacityUnits: Table!.ProvisionedThroughput!.WriteCapacityUnits!,
                  },
                }
              : {}),
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
