import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

// Static IAM user credentials (see .env.local). Vercel OIDC federation was the original
// design (see git history / plans/dynamodb-schema.md) but the AWS IAM role's trust policy
// blocks it and can't be fixed without AWS console access this account doesn't have, so
// this now authenticates as a manually created IAM user against a manually created table
// instead. Rotate DYNAMODB_SECRET_ACCESS_KEY periodically since it's a long-lived key.
const client = new DynamoDBClient({
  region: process.env.DYNAMODB_REGION!,
  credentials: {
    accessKeyId: process.env.DYNAMODB_ACCESS_KEY_ID!,
    secretAccessKey: process.env.DYNAMODB_SECRET_ACCESS_KEY!,
  },
});

const docClient = DynamoDBDocumentClient.from(client);

export function getClient() {
  return docClient;
}

/** Raw `DynamoDBClient` for administrative commands (UpdateTable, DescribeTable) that
 * the document client doesn't wrap — used by migrations, not by application code. */
export function getRawClient() {
  return client;
}

export const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME!;
