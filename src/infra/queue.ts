import { notificationsTable } from "./database";
import { emailSender } from "./email";
import { appointmentsTopic } from "./topic";

export const emailDeadLetterQueue = new sst.aws.Queue("EmailDeadLetterQueue");

export const emailQueue = new sst.aws.Queue("EmailQueue", {
  dlq: {
    queue: emailDeadLetterQueue.arn,
    retry: 3,
  },
});

emailQueue.subscribe(
  {
    handler: "src/workers/email.handler",
    link: [notificationsTable, emailSender],
  },
  {
    batch: { partialResponses: true },
  },
);

appointmentsTopic.subscribeQueue("EmailQueue", emailQueue.arn, {
  filter: { type: ["AppointmentCreated"] },
});
