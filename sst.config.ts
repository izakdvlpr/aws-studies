/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "aws-studies",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
      providers: {
        aws: {
          profile: "barbearia-dev"
        }
      }
    };
  },
  async run() {
    const appointmentsTable = new sst.aws.Dynamo("AppointmentsTable", {
      fields: { id: "string" },
      primaryIndex: { hashKey: "id" },
    });
    
    const notificationsTable = new sst.aws.Dynamo("NotificationsTable",  {
      fields: { id: "string" },
      primaryIndex: { hashKey: "id" },
    })
    
    const sender = new sst.aws.Email("Sender", {
      sender: "izakdvlpr@gmail.com"
    })
    
    const appointmentsTopic = new sst.aws.SnsTopic("AppointmentsTopic");
    
    const emailDeadLetterQueue = new sst.aws.Queue("EmailDeadLetterQueue");
    
    const emailQueue = new sst.aws.Queue("EmailQueue", {
      dlq: {
        queue: emailDeadLetterQueue.arn,
        retry: 3
      }
    });
    
    emailQueue.subscribe(
      {
        handler: "src/worker/email.handler",
        link: [notificationsTable, sender],
      },
      {
        batch: { partialResponses: true }
      }
    );
    
    appointmentsTopic.subscribeQueue("EmailQueue", emailQueue.arn, {
      filter: { type: ["AppointmentCreated"] },
    });
    
    const api = new sst.aws.ApiGatewayV2("Api")
    
    api.route("GET /health", "src/api/health.handler");

    api.route("POST /appointments", {
      handler: "src/api/appointments/create.handler",
      link: [appointmentsTable, appointmentsTopic],
    });

    api.route("GET /appointments", {
      handler: "src/api/appointments/list.handler",
      link: [appointmentsTable],
    });

    return {
      api: api.url
    };
  }
})
