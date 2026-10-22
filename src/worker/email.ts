import type { SQSHandler } from "aws-lambda";

export const handler: SQSHandler = async (event) => {
  for (const record of event.Records) {
    const envelope = JSON.parse(record.body);
    const message = JSON.parse(envelope.Message)
    const { data } = message;

    console.log(`Sending email to ${data.client} for service ${data.service} scheduled at ${data.scheduledAt}`);
  }
};