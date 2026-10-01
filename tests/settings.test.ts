import { describe, expect, it } from "vitest";
import { isLocalUrl } from "../server/settings.mjs";

describe("offline mode local-URL rule", () => {
  it("allows loopback and the user's own machine", () => {
    expect(isLocalUrl("http://127.0.0.1:7860")).toBe(true);
    expect(isLocalUrl("http://localhost:11434/v1")).toBe(true);
    expect(isLocalUrl("http://[::1]:8787")).toBe(true);
    expect(isLocalUrl("https://localhost")).toBe(true);
  });

  it("allows LAN names and mDNS .local hosts (no dot / .local)", () => {
    expect(isLocalUrl("http://mymac:7860")).toBe(true);
    expect(isLocalUrl("http://studio.local:8188")).toBe(true);
  });

  it("never allows internet hosts", () => {
    expect(isLocalUrl("https://api.openai.com/v1")).toBe(false);
    expect(isLocalUrl("http://example.com:7860")).toBe(false);
    expect(isLocalUrl("http://192.168.1.20:8787")).toBe(false);
    expect(isLocalUrl("http://10.0.2.2:8787")).toBe(false);
  });

  it("treats junk as not local", () => {
    expect(isLocalUrl("")).toBe(false);
    expect(isLocalUrl("not a url")).toBe(false);
  });
});
