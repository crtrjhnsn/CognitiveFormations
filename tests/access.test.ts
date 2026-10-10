import { describe, expect, it } from "vitest";
import { canViewItem, resolveTier } from "@/lib/access";

const now = new Date("2027-03-01T00:00:00Z");
const active = { status: "active" as const, currentPeriodEnd: new Date("2027-04-01T00:00:00Z") };

describe("resolveTier", () => {
  it("makes preview modules free for unit 1 only", () => {
    expect(resolveTier("preview", 1)).toBe("free");
    expect(resolveTier("preview", 2)).toBe("pro");
    expect(resolveTier("free", 5)).toBe("free");
    expect(resolveTier("pro", 1)).toBe("pro");
  });
});

describe("canViewItem", () => {
  it("serves free items to everyone", () => {
    expect(canViewItem("free", null, now)).toBe(true);
  });
  it("serves pro items only with an active, unexpired entitlement", () => {
    expect(canViewItem("pro", null, now)).toBe(false);
    expect(canViewItem("pro", active, now)).toBe(true);
    expect(canViewItem("pro", { ...active, status: "past_due" }, now)).toBe(false);
    expect(canViewItem("pro", { ...active, currentPeriodEnd: new Date("2027-02-01T00:00:00Z") }, now)).toBe(false);
  });
});
