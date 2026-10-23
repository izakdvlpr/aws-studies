import type { SQSBatchItemFailure, SQSHandler } from "aws-lambda";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";

const ses = new SESv2Client({});
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const serviceNames: Record<string, string> = {
  haircut: "Corte",
  beard: "Barba",
  combo: "Corte + Barba",
};

const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));

const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

async function reserveDelivery(key: string): Promise<boolean> {
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

async function releaseReservation(key: string) {
  await db.send(
    new DeleteCommand({
      TableName: Resource.NotificationsTable.name,
      Key: { id: key },
    })
  );
}

async function markAsSent(key: string) {
  await db.send(
    new PutCommand({
      TableName: Resource.NotificationsTable.name,
      Item: { id: key, status: "sent", sentAt: new Date().toISOString() },
    })
  );
}

async function sendConfirmation(appointment: any) {
  const customer = escapeHtml(appointment.customer);
  const service = serviceNames[appointment.service] ?? appointment.service;
  const when = formatDateTime(appointment.scheduledAt);

  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: Resource.EmailSender.sender,
      Destination: { ToAddresses: [appointment.email] },
      Content: {
        Simple: {
          Subject: {
            Data: "Agendamento confirmado - Barbearia do José",
            Charset: "UTF-8",
          },
          Body: {
            Text: {
              Charset: "UTF-8",
              Data: [
                `Olá, ${appointment.customer}!`,
                "",
                "Seu agendamento está confirmado:",
                `- Serviço: ${service}`,
                `- Quando: ${when}`,
                "",
                "Até lá!",
                "Barbearia do José",
              ].join("\n"),
            },
            Html: {
              Charset: "UTF-8",
              Data: `
                <h2>Olá, ${customer}!</h2>
                <p>Seu agendamento está confirmado:</p>
                <ul>
                  <li><strong>Serviço:</strong> ${service}</li>
                  <li><strong>Quando:</strong> ${when}</li>
                </ul>
                <p>Até lá!<br />Barbearia do José 💈</p>
              `,
            },
          },
        },
      },
    })
  );
}

export const handler: SQSHandler = async (event) => {
  const failures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      const envelope = JSON.parse(record.body);
      const message = JSON.parse(envelope.Message)
      const { data } = message;
      const key = `${data.id}#confirmation`;

      const reserved = await reserveDelivery(key);
      
      if (!reserved) {
        console.log(`[email] ${key} already processed, skipping duplicate`);
        
        continue;
      }

      try {
        await sendConfirmation(data);
      } catch (err) {
        await releaseReservation(key);
        
        throw err;
      }

      await markAsSent(key);
      
      console.log(`[email] Confirmation sent to ${data.email} (${key})`);
    } catch (err) {
      console.error(`[email] Failed to process message ${record.messageId}`, err);
      
      failures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures: failures };
};