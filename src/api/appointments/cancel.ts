import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { Resource } from "sst";
import { json } from '../../utils/http';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient({});

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const id = event.pathParameters?.id;

  if (!id) {
    return json(400, { error: "Missing appointment id" });
  }

  let appointment: Record<string, unknown> | undefined;

  try {
    const result = await db.send(
      new UpdateCommand({
        TableName: Resource.AppointmentsTable.name,
        Key: { id },
        UpdateExpression: "SET #status = :cancelled, cancelledAt = :now",
        ConditionExpression:
          "attribute_exists(id) AND (attribute_not_exists(#status) OR #status <> :cancelled)",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":cancelled": "cancelled",
          ":now": new Date().toISOString(),
        },
        ReturnValues: "ALL_NEW",
      })
    );

    appointment = result.Attributes;
  } catch (err) {
    if ((err as Error).name !== "ConditionalCheckFailedException") throw err;

    const existing = await db.send(
      new GetCommand({ TableName: Resource.AppointmentsTable.name, Key: { id } })
    );

    return existing.Item
      ? json(409, { error: "Appointment already cancelled" })
      : json(404, { error: "Appointment not found" });
  }

  const message = {
    type: "AppointmentCancelled",
    data: appointment,
    createdAt: new Date().toISOString(),
  }

  await sns.send(
    new PublishCommand({
      TopicArn: Resource.AppointmentsTopic.arn,
      Message: JSON.stringify(message),
      MessageAttributes: {
        type: { DataType: "String", StringValue: message.type },
      },
    })
  );

  return json(200, { appointment });
}
