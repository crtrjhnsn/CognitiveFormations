import * as Sentry from "@sentry/nextjs";
import { scrubEvent, SENTRY_DATA_COLLECTION } from "@/config/monitoring";

// Error monitoring. Sends server errors to Sentry when SENTRY_DSN is set;
// without it nothing is sent. Reports carry no personal data
// (src/config/monitoring.ts).
export function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    dataCollection: SENTRY_DATA_COLLECTION,
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  });
}

export const onRequestError = Sentry.captureRequestError;
