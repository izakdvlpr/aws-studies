/// <reference path="../../../sst-env.d.ts" />

import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler: APIGatewayProxyHandlerV2 = async () => {
  const result = await db.send(
    new ScanCommand({ TableName: Resource.AppointmentsTable.name })
  )
  
  const appointments = (result.Items ?? []).sort((a, b) =>
    String(a.scheduledAt).localeCompare(String(b.scheduledAt))
  );
  
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appointments }),
  }
}