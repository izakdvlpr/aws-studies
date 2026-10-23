import type { SQSBatchItemFailure, SQSHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { Resource } from "sst";
import { z } from "zod";
import { APP_TIMEZONE, dayjs } from "../utils/date";
import { markAsSent, releaseReservation, reserveDelivery } from "../utils/delivery";

const sns = new SNSClient({});
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const serviceNames: Record<string, string> = {
  haircut: "corte",
  beard: "barba",
  combo: "corte + barba",
};

const appointmentSchema = z.object({
  id: z.string(),
  phone: z.string(),
  service: z.string(),
  scheduledAt: z.string(),
  status: z.string().optional(),
});

async function sendReminder(appointment: z.infer<typeof appointmentSchema>) {
  const service = serviceNames[appointment.service] ?? appointment.service;
  const time = dayjs(appointment.scheduledAt).tz(APP_TIMEZONE).format("HH:mm");

  await sns.send(
    new PublishCommand({
      PhoneNumber: appointment.phone,
      Message: `Barbearia do Jose: lembrete, seu horario de ${service} e hoje as ${time}. Te esperamos!`,
      MessageAttributes: {
        "AWS.SNS.SMS.SMSType": { DataType: "String", StringValue: "Transactional" },
      },
    })
  );
}

export const handler: SQSHandler = async (event) => {
  const failures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      const { appointmentId } = JSON.parse(record.body);

      const { Item } = await db.send(
        new GetCommand({
          TableName: Resource.AppointmentsTable.name,
          Key: { id: appointmentId },
        })
      );

      const appointment = Item ? appointmentSchema.parse(Item) : undefined;

      if (!appointment || appointment.status === "cancelled") {
        console.log(`[sms] ${appointmentId} not found or cancelled, skipping reminder`);

        continue;
      }

      const key = `${appointmentId}#reminder`;

      const reserved = await reserveDelivery(key);

      if (!reserved) {
        console.log(`[sms] ${key} already processed, skipping duplicate`);

        continue;
      }

      try {
        await sendReminder(appointment);
      } catch (err) {
        await releaseReservation(key);

        throw err;
      }

      await markAsSent(key);

      console.log(`[sms] Reminder sent to ${appointment.phone} (${key})`);
    } catch (err) {
      console.error(`[sms] Failed to process message ${record.messageId}`, err);

      failures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures: failures };
};
