import { describe, expect, it } from "vitest";
import { scrubEvent } from "@/config/monitoring";

describe("scrubEvent", () => {
  it("drops who sent the request and what it carried", () => {
    const event = scrubEvent({
      request: { url: "https://site.test/auth/callback?code=abc", headers: { cookie: "x" }, cookies: { a: "1" }, data: "{}", query_string: "code=abc" },
      contexts: { nextjs: { request_path: "/auth/callback?code=abc" } },
      user: { email: "student@example.com" },
    });
    expect(event).toEqual({
      request: { url: "https://site.test/auth/callback" },
      contexts: { nextjs: { request_path: "/auth/callback" } },
    });
  });
});
