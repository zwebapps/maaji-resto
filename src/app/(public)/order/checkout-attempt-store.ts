"use client";

import { newRequestId } from "./cart-store";

/**
 * ONE order per basket, whichever tab or payment button places it
 * (owner, 2026-11-15).
 *
 * The cart sends a `clientRequestId` with every order, and the server
 * answers a repeated id with the order it already created (`replayed`).
 * That key used to live in one tab's memory and changed with the payment
 * method — so the same basket tapped "Card" in one tab and "PayPal" in
 * another became TWO orders, and the guest could pay both.
 *
 * Here the key lives in localStorage, shared by every tab of this venue,
 * and is tied to the basket's `signature` (items, order type, contact,
 * address, time — never the payment method). Same basket → same key →
 * same order, and the payment guards on that one order (`already_paid`,
 * closing a superseded card page, capture-once) do the rest.
 *
 * A key is reused for `MAX_AGE_MS` only, so the same basket ordered again
 * tomorrow is a new order; "start a new order" clears it at once.
 *
 * Same posture as `cart-store.ts` / `last-order-store.ts`: strictly
 * functional storage, every access wrapped — a browser that refuses
 * storage still gets a fresh key per submit, which is what it had before.
 */

export interface CheckoutAttempt {
  key: string;
  signature: string;
  /** Epoch ms the key was minted. */
  at: number;
}

export const MAX_AGE_MS = 2 * 60 * 60 * 1000;

function storageKey(slug: string): string {
  return `rangla-checkout-attempt:${slug}`;
}

function read(slug: string): CheckoutAttempt | null {
  try {
    const raw = window.localStorage.getItem(storageKey(slug));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<CheckoutAttempt>;
    if (
      typeof value.key !== "string" ||
      value.key.length < 8 ||
      typeof value.signature !== "string" ||
      typeof value.at !== "number"
    ) {
      return null;
    }
    return value as CheckoutAttempt;
  } catch {
    return null;
  }
}

/**
 * The request key for this basket: the stored one while it is the same
 * basket and still fresh, otherwise a new one (stored for the other tabs).
 */
export function attemptKeyFor(slug: string, signature: string, now = Date.now()): string {
  if (typeof window === "undefined") return newRequestId();
  const stored = read(slug);
  if (stored && stored.signature === signature && now - stored.at < MAX_AGE_MS) {
    return stored.key;
  }
  const next: CheckoutAttempt = { key: newRequestId(), signature, at: now };
  try {
    window.localStorage.setItem(storageKey(slug), JSON.stringify(next));
  } catch {
    // Storage refused: this submit still has its key.
  }
  return next.key;
}

/** "Start a new order": the next basket gets a new key, so a new order. */
export function clearAttempt(slug: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(slug));
  } catch {
    // Nothing stored, or storage refused — either way nothing to clear.
  }
}
