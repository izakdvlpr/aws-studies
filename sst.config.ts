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
    
    const appointmentsTopic = new sst.aws.SnsTopic("AppointmentsTopic");
    
    const appointmentsQueue = new sst.aws.Queue("AppointmentsQueue");
    
    appointmentsQueue.subscribe("src/worker/email.handler");
    
    appointmentsTopic.subscribeQueue("AppointmentsQueue", appointmentsQueue.arn, {
      filter: { type: ["AppointmentCreated"] },
    });
    
    const appointmentsApi = new sst.aws.ApiGatewayV2("AppointmentsApi")

    appointmentsApi.route("POST /appointments", {
      handler: "src/api/appointments/create.handler",
      link: [appointmentsTable, appointmentsTopic],
    });

    appointmentsApi.route("GET /appointments", {
      handler: "src/api/appointments/list.handler",
      link: [appointmentsTable],
    });

    return {
      appointmentsApi: appointmentsApi.url,
      appointmentsTable: appointmentsTable.name,
      appointmentsTopic: appointmentsTopic.name,
    };
  }
})
