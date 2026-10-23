import type { SQSBatchItemFailure, SQSHandler } from "aws-lambda";
import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
  SchedulerClient,
} from "@aws-sdk/client-scheduler";
import { z } from "zod";
import { APP_TIMEZONE, dayjs } from "../utils/date";

const env = z
  .object({
    SMS_QUEUE_ARN: z.string().min(1),
    SCHEDULER_ROLE_ARN: z.string().min(1),
    SCHEDULE_GROUP: z.string().min(1),
  })
  .parse(process.env);

const scheduler = new SchedulerClient({});

const scheduleName = (appointmentId: string) => `reminder-${appointmentId}`;

async function createReminder(appointment: { id: string; scheduledAt: string }) {
  const remindAt = dayjs(appointment.scheduledAt).subtract(1, "hour").tz(APP_TIMEZONE);

  if (remindAt.isBefore(dayjs())) {
    console.log(`[scheduler] ${appointment.id} is less than 1h away, skipping reminder`);

    return;
  }

  try {
    await scheduler.send(
      new CreateScheduleCommand({
        Name: scheduleName(appointment.id),
        GroupName: env.SCHEDULE_GROUP,
        ScheduleExpression: `at(${remindAt.format("YYYY-MM-DDTHH:mm:ss")})`,
        ScheduleExpressionTimezone: APP_TIMEZONE,
        FlexibleTimeWindow: { Mode: "OFF" },
        ActionAfterCompletion: "DELETE",
        Target: {
          Arn: env.SMS_QUEUE_ARN,
          RoleArn: env.SCHEDULER_ROLE_ARN,
          Input: JSON.stringify({ appointmentId: appointment.id }),
        },
      })
    );

    console.log(`[scheduler] Reminder for ${appointment.id} scheduled at ${remindAt.format()}`);
  } catch (err) {
    if ((err as Error).name === "ConflictException") {
      console.log(`[scheduler] Reminder for ${appointment.id} already exists, skipping duplicate`);

      return;
    }

    throw err;
  }
}

async function deleteReminder(appointmentId: string) {
  try {
    await scheduler.send(
      new DeleteScheduleCommand({
        Name: scheduleName(appointmentId),
        GroupName: env.SCHEDULE_GROUP,
      })
    );

    console.log(`[scheduler] Reminder for ${appointmentId} deleted`);
  } catch (err) {
    if ((err as Error).name === "ResourceNotFoundException") {
      console.log(`[scheduler] No reminder found for ${appointmentId}`);

      return;
    }

    throw err;
  }
}

export const handler: SQSHandler = async (event) => {
  const failures: SQSBatchItemFailure[] = [];

  for (const record of event.Records) {
    try {
      const envelope = JSON.parse(record.body);
      const message = JSON.parse(envelope.Message);
      const { type, data } = message;

      if (type === "AppointmentCreated") {
        await createReminder(data);
      } else if (type === "AppointmentCancelled") {
        await deleteReminder(data.id);
      } else {
        console.warn(`[scheduler] Ignoring unknown event type ${type}`);
      }
    } catch (err) {
      console.error(`[scheduler] Failed to process message ${record.messageId}`, err);

      failures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures: failures };
};
