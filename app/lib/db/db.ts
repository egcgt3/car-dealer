import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { awsCredentialsProvider } from "@vercel/functions/oidc";

const client = new DynamoDBClient({
  region: process.env.car_dealer_AWS_REGION!,
  credentials: awsCredentialsProvider({
    roleArn: process.env.car_dealer_AWS_ROLE_ARN!,
    clientConfig: { region: process.env.car_dealer_AWS_REGION! },
  }),
});

const docClient = DynamoDBDocumentClient.from(client);

export function getClient() {
  return docClient;
}
