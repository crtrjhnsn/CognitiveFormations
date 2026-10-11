import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  // Project ref from the Trigger.dev dashboard. It isn't a secret, and builds
  // that Trigger.dev runs from GitHub don't see our environment variables.
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_atuhkyapipcelikjlgwz",
  dirs: ["./src/trigger"],
  maxDuration: 900,
  retries: {
    enabledInDev: false,
    // Spec: rate-limit, overload and timeout errors retry up to 5 attempts with backoff.
    default: { maxAttempts: 5, factor: 2, minTimeoutInMs: 2_000, maxTimeoutInMs: 60_000, randomize: true },
  },
});
