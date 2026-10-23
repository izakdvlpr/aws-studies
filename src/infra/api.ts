import { appointmentsTable } from "./database";
import { appointmentsTopic } from "./topic";

export const api = new sst.aws.ApiGatewayV2("Api");

api.route("GET /health", "src/api/health.handler");

api.route("POST /appointments", {
  handler: "src/api/appointments/create.handler",
  link: [appointmentsTable, appointmentsTopic],
});

api.route("GET /appointments", {
  handler: "src/api/appointments/list.handler",
  link: [appointmentsTable],
});

api.route("POST /appointments/{id}/cancel", {
  handler: "src/api/appointments/cancel.handler",
  link: [appointmentsTable, appointmentsTopic],
});
