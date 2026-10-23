import { randomUUID } from "node:crypto";
import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import { z } from "zod";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { json } from '../../utils/http';

const schema = z.object({
  customer: z.string().trim().min(1),
  email: z.email(),
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  service: z.enum(["haircut", "beard", "combo"]),
  scheduledAt: z.iso.datetime({ offset: true })
})

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient({});

export const handler: APIGatewayProxyHandlerV2 = async ({ body }) => {
  const result = schema.safeParse(JSON.parse(body ?? '{}'))
  
  if (!result.success) {
    return json(400, { error: z.flattenError(result.error).fieldErrors });
  }
  
  const data = result.data
  
  const appointment = {
    id: randomUUID(),
    ...data,
    createdAt: new Date().toISOString(),
  };

  await db.send(
    new PutCommand({
      TableName: Resource.AppointmentsTable.name,
      Item: appointment,
    })
  );
  
  const event = {
    type: "AppointmentCreated",
    data: appointment,
    createdAt: new Date().toISOString(),
  }
  
  await sns.send(
    new PublishCommand({
      TopicArn: Resource.AppointmentsTopic.arn,
      Message: JSON.stringify(event),
      MessageAttributes: {
        type: { DataType: "String", StringValue: event.type },
      },
    })
  );
  
  return json(201, { appointment });
}