// Only same-site paths are allowed as a post-sign-in destination.
export function safeNextPath(value: unknown, fallback = "/"): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
    ? value
    : fallback;
}
