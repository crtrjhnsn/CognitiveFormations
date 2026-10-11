import postgres from "postgres";
import { requireEnv } from "@/lib/env";

export type Sql = postgres.Sql;

let client: Sql | undefined;

// Direct Postgres connection for server code (pages, actions, jobs). It
// bypasses row-level security, so every caller must check access first.
export function db(): Sql {
  client ??= postgres(requireEnv("DATABASE_URL"), { max: 5, prepare: false });
  return client;
}
