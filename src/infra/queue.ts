import { appointmentsTable, notificationsTable } from "./database";
import { emailSender } from "./email";
import { appointmentsTopic } from "./topic";

export const emailDeadLetterQueue = new sst.aws.Queue("EmailDeadLetterQueue");

export const smsDeadLetterQueue = new sst.aws.Queue("SmsDeadLetterQueue");

export const emailQueue = new sst.aws.Queue("EmailQueue", {
  dlq: {
    queue: emailDeadLetterQueue.arn,
    retry: 3,
  },
});

export const smsQueue = new sst.aws.Queue("SmsQueue", {
  dlq: {
    queue: smsDeadLetterQueue.arn,
    retry: 3,
  }
})

export const schedulerQueue = new sst.aws.Queue("SchedulerQueue");

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

smsQueue.subscribe(
  {
    handler: "src/workers/sms.handler",
    link: [appointmentsTable, notificationsTable],
    permissions: [{ actions: ["sns:Publish"], resources: ["*"] }],
  },
  { batch: { partialResponses: true } }
);

const { accountId } = aws.getCallerIdentityOutput();

const reminderScheduleGroup = new aws.scheduler.ScheduleGroup("ReminderScheduleGroup", {
  name: `${$app.name}-${$app.stage}-reminders`,
});

const schedulerRole = new aws.iam.Role("ReminderSchedulerRole", {
  assumeRolePolicy: accountId.apply((account) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { Service: "scheduler.amazonaws.com" },
          Action: "sts:AssumeRole",
          Condition: { StringEquals: { "aws:SourceAccount": account } },
        },
      ],
    })
  ),
});

new aws.iam.RolePolicy("ReminderSchedulerPolicy", {
  role: schedulerRole.id,
  policy: smsQueue.arn.apply((queueArn) =>
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "sqs:SendMessage",
          Resource: queueArn,
        },
      ],
    })
  ),
});

schedulerQueue.subscribe(
  {
    handler: "src/workers/scheduler.handler",
    environment: {
      SMS_QUEUE_ARN: smsQueue.arn,
      SCHEDULER_ROLE_ARN: schedulerRole.arn,
      SCHEDULE_GROUP: reminderScheduleGroup.name,
    },
    permissions: [
      {
        actions: ["scheduler:CreateSchedule", "scheduler:DeleteSchedule"],
        resources: [
          $interpolate`arn:aws:scheduler:*:${accountId}:schedule/${reminderScheduleGroup.name}/*`,
        ],
      },
      {
        actions: ["iam:PassRole"],
        resources: [schedulerRole.arn],
        conditions: [
          {
            test: "StringEquals",
            variable: "iam:PassedToService",
            values: ["scheduler.amazonaws.com"],
          },
        ],
      },
    ],
  },
  { batch: { partialResponses: true } }
);

appointmentsTopic.subscribeQueue("SchedulerSubscription", schedulerQueue.arn, {
  filter: { type: ["AppointmentCreated", "AppointmentCancelled"] },
});