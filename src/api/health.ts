import type { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { json } from '../util/http';

export const handler: APIGatewayProxyHandlerV2 = async () => {
  return json(200, { status: "ok" });
}