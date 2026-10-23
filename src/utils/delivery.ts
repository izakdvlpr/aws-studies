import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export async function reserveDelivery(key: string): Promise<boolean> {
  try {
    await db.send(
      new PutCommand({
        TableName: Resource.NotificationsTable.name,
        Item: { id: key, status: "sending", createdAt: new Date().toISOString() },
        ConditionExpression: "attribute_not_exists(id)",
      })
    );
    
    return true;
  } catch (err) {
    if ((err as Error).name === "ConditionalCheckFailedException") return false;
    
    throw err;
  }
}

export async function releaseReservation(key: string) {
  await db.send(
    new DeleteCommand({
      TableName: Resource.NotificationsTable.name,
      Key: { id: key },
    })
  );
}

export async function markAsSent(key: string) {
  await db.send(
    new PutCommand({
      TableName: Resource.NotificationsTable.name,
      Item: { id: key, status: "sent", sentAt: new Date().toISOString() },
    })
  );
}
