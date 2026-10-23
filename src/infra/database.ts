export const appointmentsTable = new sst.aws.Dynamo("AppointmentsTable", {
  fields: { id: "string" },
  primaryIndex: { hashKey: "id" },
});

export const notificationsTable = new sst.aws.Dynamo("NotificationsTable", {
  fields: { id: "string" },
  primaryIndex: { hashKey: "id" },
});
