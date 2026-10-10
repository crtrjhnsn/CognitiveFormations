// Reads a required environment variable at call time, so builds and tests
// don't need secrets that only the running server uses.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}
