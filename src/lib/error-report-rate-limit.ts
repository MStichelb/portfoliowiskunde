import { createHmac } from "node:crypto";

export class ErrorReportRateLimitError extends Error {
  constructor() {
    super("Error report rate limit reached.");
    this.name = "ErrorReportRateLimitError";
  }
}

export function authenticatedErrorReportRateLimitKey(secret: string, reporterUserId: string, bucket: number): string {
  return createHmac("sha256", secret).update(`${bucket}:user:${reporterUserId}`).digest("base64url");
}
