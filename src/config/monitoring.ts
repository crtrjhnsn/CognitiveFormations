import type * as Sentry from "@sentry/nextjs";

type DataCollection = NonNullable<Parameters<typeof Sentry.init>[0]["dataCollection"]>;

// What error reports may carry. Students can be minors, so reports hold the
// error and where it happened, never who it happened to or what they sent.
export const SENTRY_DATA_COLLECTION: DataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  databaseQueryData: false,
  stackFrameVariables: false,
  genAI: { inputs: false, outputs: false },
  queues: false,
};

// A second guard in case an integration attaches request data anyway. Query
// strings go too: sign-in links carry one-time codes in theirs.
interface ScrubbableEvent {
  request?: { headers?: unknown; cookies?: unknown; data?: unknown; query_string?: unknown; url?: string };
  contexts?: { nextjs?: { request_path?: unknown } } & Record<string, unknown>;
  user?: unknown;
}

const withoutQuery = (path: string) => path.split("?")[0];

export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  if (event.request) {
    delete event.request.headers;
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.url) event.request.url = withoutQuery(event.request.url);
  }
  const nextjs = event.contexts?.nextjs;
  if (nextjs && typeof nextjs.request_path === "string") nextjs.request_path = withoutQuery(nextjs.request_path);
  delete event.user;
  return event;
}
