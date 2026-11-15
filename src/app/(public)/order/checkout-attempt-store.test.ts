import { afterEach, describe, expect, it, vi } from "vitest";
import { attemptKeyFor, clearAttempt, MAX_AGE_MS } from "./checkout-attempt-store";

/**
 * One request key per basket, shared by every tab — the guard that keeps
 * "Card in one tab, PayPal in another" on ONE order (owner, 2026-11-15).
 */

const SLUG = "maaji";

function installStorage(opts: { failWrites?: boolean } = {}): Map<string, string> {
  const map = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string): string | null => map.get(k) ?? null,
      setItem: (k: string, v: string): void => {
        if (opts.failWrites) throw new Error("QuotaExceededError");
        map.set(k, v);
      },
      removeItem: (k: string): void => {
        map.delete(k);
      },
    },
  });
  return map;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checkout attempt key", () => {
  it("the same basket gets the same key — in this tab or another", () => {
    installStorage();
    const first = attemptKeyFor(SLUG, "basket-A", 1_000);
    // A second tab reads the same storage: same basket, same key.
    expect(attemptKeyFor(SLUG, "basket-A", 2_000)).toBe(first);
  });

  it("a changed basket gets a new key", () => {
    installStorage();
    const first = attemptKeyFor(SLUG, "basket-A", 1_000);
    expect(attemptKeyFor(SLUG, "basket-B", 2_000)).not.toBe(first);
  });

  it("an old key is not reused, so the same basket tomorrow is a new order", () => {
    installStorage();
    const first = attemptKeyFor(SLUG, "basket-A", 0);
    expect(attemptKeyFor(SLUG, "basket-A", MAX_AGE_MS + 1)).not.toBe(first);
  });

  it("starting a new order clears the key", () => {
    installStorage();
    const first = attemptKeyFor(SLUG, "basket-A", 1_000);
    clearAttempt(SLUG);
    expect(attemptKeyFor(SLUG, "basket-A", 2_000)).not.toBe(first);
  });

  it("venues do not share keys", () => {
    installStorage();
    expect(attemptKeyFor("one", "basket-A", 1_000)).not.toBe(
      attemptKeyFor("two", "basket-A", 1_000),
    );
  });

  it("a garbled stored value is ignored, not trusted", () => {
    const map = installStorage();
    map.set(`rangla-checkout-attempt:${SLUG}`, '{"key":1,"signature":"basket-A"}');
    expect(typeof attemptKeyFor(SLUG, "basket-A", 1_000)).toBe("string");
  });

  it("storage refusing writes still yields a key for this submit", () => {
    installStorage({ failWrites: true });
    expect(attemptKeyFor(SLUG, "basket-A", 1_000).length).toBeGreaterThan(7);
  });
});
