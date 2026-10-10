// The paywall rule from the spec, kept pure so it is easy to test.

export type Tier = "free" | "preview" | "pro";
export type ResolvedTier = "free" | "pro";

export interface Entitlement {
  status: "active" | "past_due" | "canceled";
  currentPeriodEnd: Date;
}

// Preview modules are free for the first unit and Pro for the rest.
export function resolveTier(moduleTier: Tier, unitPosition: number | null): ResolvedTier {
  if (moduleTier === "preview") return unitPosition === 1 ? "free" : "pro";
  return moduleTier;
}

export function hasActiveEntitlement(entitlement: Entitlement | null, now: Date = new Date()): boolean {
  return entitlement !== null && entitlement.status === "active" && entitlement.currentPeriodEnd > now;
}

// An item is served in full if it is free or the viewer is entitled;
// otherwise the API returns a stub and the page renders a lock card.
export function canViewItem(tier: ResolvedTier, entitlement: Entitlement | null, now: Date = new Date()): boolean {
  return tier === "free" || hasActiveEntitlement(entitlement, now);
}
