import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "./db";
import { signupUser } from "./auth-service";
import { asTenant } from "./tenant";
import { placeOrder } from "./order-service";
import {
  cancelUnpaidOrderByGuest,
  createOrderPayment,
  createOrderPaymentIntent,
  processStripeOrderPayment,
  switchUnpaidOrderToCash,
  verifyOrderPayment,
} from "./connect-service";
import {
  createPayPalOrderPayment,
  finalizePayPalReturn,
  processPayPalOrderPayment,
} from "./paypal-service";
import { getStripeProvider } from "./stripe";
import type { FakeStripeProvider } from "./stripe/fake-provider";

/**
 * The guest's journeys between Card, PayPal and Cash on ONE order (owner,
 * 2026-11-15: "can anyone get paid status without paying? payment only
 * once, every other attempt rejected as already paid").
 *
 * Fake providers: a card "page" is a Stripe checkout the test reserves with
 * `settleOrderCheckout` (the guest entering their card), PayPal approves on
 * creation (the guest approving at PayPal). Each journey checks the three
 * things that matter:
 *   - the order is `paid` only after money was really taken,
 *   - money is taken at most ONCE (one settled attempt, one captured rail),
 *   - every later attempt to pay is refused with `already_paid`.
 */
describe("payment switching journeys (fake providers)", () => {
  const createdUserIds: string[] = [];
  const createdTenantIds: string[] = [];

  afterEach(async () => {
    for (const tid of createdTenantIds) {
      await asTenant(tid, (tx) => tx.membership.deleteMany({}));
      await asTenant(tid, (tx) => tx.tenant.deleteMany({}));
    }
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    createdUserIds.length = 0;
    createdTenantIds.length = 0;
  });

  async function fixture() {
    const s = await signupUser({
      email: `switch-${randomUUID()}@ex.com`,
      password: "S3cureP4ssPhrase!",
      tenantName: "Switching Test",
    });
    if (!s.ok) throw new Error("signup failed");
    createdUserIds.push(s.userId);
    createdTenantIds.push(s.tenantId);
    return asTenant(s.tenantId, async (tx) => {
      // Card and PayPal on, cash accepted, no email-code switch (dine-in
      // style rules) — the code itself is covered in order-email-code.test.
      await tx.tenant.updateMany({ data: { stripeOwnEnabled: true, paypalOwnEnabled: true } });
      const venue = await tx.venue.create({
        data: {
          tenantId: s.tenantId,
          name: "Switch Venue",
          slug: `sw-${randomUUID().slice(0, 8)}`,
          currency: "EUR",
        },
        select: { id: true },
      });
      const menu = await tx.menu.create({
        data: { tenantId: s.tenantId, venueId: venue.id, name: "Main", isDefault: true },
        select: { id: true },
      });
      const version = await tx.menuVersion.create({
        data: {
          tenantId: s.tenantId,
          menuId: menu.id,
          status: "published",
          publishedAt: new Date(),
        },
        select: { id: true },
      });
      await tx.menu.update({ where: { id: menu.id }, data: { publishedVersion: version.id } });
      const cat = await tx.category.create({
        data: { tenantId: s.tenantId, menuVersionId: version.id, name: "Mains", orderIndex: 0 },
        select: { id: true },
      });
      const item = await tx.item.create({
        data: {
          tenantId: s.tenantId,
          categoryId: cat.id,
          name: "Papadam",
          priceCents: 490,
          orderIndex: 0,
        },
        select: { id: true },
      });
      return {
        userId: s.userId,
        tenantId: s.tenantId,
        venueId: venue.id,
        publishedVersionId: version.id,
        itemId: item.id,
      };
    });
  }
  type Fx = Awaited<ReturnType<typeof fixture>>;

  /** An order placed with Card / PayPal chosen in the cart: pending, unpaid. */
  async function onlineOrder(fx: Fx, method: "card" | "paypal") {
    const placed = await placeOrder(fx, {
      orderType: "dine_in",
      tableNumber: "7",
      items: [{ itemId: fx.itemId, quantity: 1 }],
      intendedPayment: method,
    });
    if (!placed.ok) throw new Error(`order failed: ${placed.error}`);
    return { orderId: placed.value.orderId, token: placed.value.receiptToken };
  }

  const fake = async () => (await getStripeProvider()) as unknown as FakeStripeProvider;
  const read = (fx: Fx, orderId: string) =>
    asTenant(fx.tenantId, (tx) => tx.order.findFirstOrThrow({ where: { id: orderId } }));
  const settledAttempts = (fx: Fx, orderId: string) =>
    asTenant(fx.tenantId, (tx) =>
      tx.paymentAttempt.findMany({ where: { orderId, settled: true }, select: { provider: true } }),
    );
  const stripeState = async (ref: string) =>
    (await (await fake()).retrievePaymentIntent(ref))?.status;

  async function startCard(fx: Fx, orderId: string, token: string): Promise<string> {
    const r = await createOrderPayment(fx.tenantId, orderId, token);
    if (!r.ok) throw new Error(`card start refused: ${r.error}`);
    return (await read(fx, orderId)).paymentRef!;
  }
  async function startPayPal(fx: Fx, orderId: string, token: string): Promise<string> {
    const r = await createPayPalOrderPayment(fx.tenantId, orderId, token);
    if (!r.ok) throw new Error(`paypal start refused: ${r.error}`);
    return (await read(fx, orderId)).paymentRef!;
  }
  /** The guest enters their card on the Stripe page, then Stripe tells us. */
  async function payOnCardPage(fx: Fx, orderId: string, ref: string) {
    (await fake()).settleOrderCheckout(ref);
    return processStripeOrderPayment(fx.tenantId, ref, { orderId, source: "webhook" });
  }

  /** After a payment: every way to pay again is refused as already paid. */
  async function expectEveryFurtherPaymentRefused(fx: Fx, orderId: string, token: string) {
    expect(await createOrderPayment(fx.tenantId, orderId, token)).toEqual({
      ok: false,
      error: "already_paid",
    });
    expect(await createOrderPaymentIntent(fx.tenantId, orderId, token)).toMatchObject({
      ok: false,
    });
    expect(await createPayPalOrderPayment(fx.tenantId, orderId, token)).toEqual({
      ok: false,
      error: "already_paid",
    });
    expect(await switchUnpaidOrderToCash(fx.tenantId, orderId, token)).toEqual({
      ok: false,
      error: "already_paid",
    });
    expect(await cancelUnpaidOrderByGuest(fx.tenantId, orderId, token)).toEqual({
      ok: false,
      error: "already_paid",
    });
  }

  // ------------------------------------------------- no money, no "paid"

  it("an online order is never paid until money is taken — not by placing, starting, or asking", async () => {
    const fx = await fixture();
    for (const method of ["card", "paypal"] as const) {
      const { orderId, token } = await onlineOrder(fx, method);
      expect((await read(fx, orderId)).paymentStatus).toBe("pending");
      if (method === "card") {
        const ref = await startCard(fx, orderId, token);
        // The guest is on the card page but has not paid: asking changes nothing.
        expect(await verifyOrderPayment(fx.tenantId, orderId, token)).toMatchObject({
          paid: false,
        });
        expect(
          await processStripeOrderPayment(fx.tenantId, ref, { orderId, source: "verify" }),
        ).not.toMatchObject({ kind: "settled" });
      }
      expect((await read(fx, orderId)).paymentStatus).not.toBe("paid");
      expect(await settledAttempts(fx, orderId)).toHaveLength(0);
    }
  });

  it("switching to cash never makes an order paid", async () => {
    const fx = await fixture();
    const { orderId, token } = await onlineOrder(fx, "card");
    await startCard(fx, orderId, token);
    expect((await switchUnpaidOrderToCash(fx.tenantId, orderId, token)).ok).toBe(true);
    const row = await read(fx, orderId);
    expect(row.paymentStatus).toBe("none");
    expect(row.paymentProvider).toBeNull();
    expect(await settledAttempts(fx, orderId)).toHaveLength(0);
  });

  // --------------------------------------------- Card ↔ PayPal, then pay

  it("Card → PayPal → pay with PayPal: the old card page cannot charge; all later payments refused", async () => {
    const fx = await fixture();
    const { orderId, token } = await onlineOrder(fx, "card");
    const cardRef = await startCard(fx, orderId, token);
    await startPayPal(fx, orderId, token);
    expect(await stripeState(cardRef)).toBe("canceled");

    expect(await finalizePayPalReturn(fx.tenantId, orderId)).toEqual({ paid: true });
    // The guest goes back to the old card tab and pays there.
    expect((await fake()).settleOrderCheckout(cardRef)).toBeNull();

    expect(await read(fx, orderId)).toMatchObject({
      paymentStatus: "paid",
      paymentProvider: "paypal",
    });
    expect(await settledAttempts(fx, orderId)).toEqual([{ provider: "paypal" }]);
    await expectEveryFurtherPaymentRefused(fx, orderId, token);
  });

  it("PayPal → Card → pay by card: the old PayPal approval is never captured; later payments refused", async () => {
    const fx = await fixture();
    const { orderId, token } = await onlineOrder(fx, "paypal");
    // The guest APPROVED at PayPal (fake approves at once), then switched.
    const paypalRef = await startPayPal(fx, orderId, token);
    const cardRef = await startCard(fx, orderId, token);
    expect((await payOnCardPage(fx, orderId, cardRef)).kind).toBe("settled");

    // The old PayPal approval arrives late (return leg / webhook).
    const late = await processPayPalOrderPayment(fx.tenantId, paypalRef, {
      orderId,
      source: "webhook",
    });
    expect(late.kind).not.toBe("settled");

    expect(await read(fx, orderId)).toMatchObject({
      paymentStatus: "paid",
      paymentProvider: "stripe",
    });
    expect(await settledAttempts(fx, orderId)).toEqual([{ provider: "stripe" }]);
    await expectEveryFurtherPaymentRefused(fx, orderId, token);
  });

  it("paid by card, then PayPal is tapped in another tab: refused, nothing captured", async () => {
    const fx = await fixture();
    const { orderId, token } = await onlineOrder(fx, "card");
    const cardRef = await startCard(fx, orderId, token);
    expect((await payOnCardPage(fx, orderId, cardRef)).kind).toBe("settled");
    await expectEveryFurtherPaymentRefused(fx, orderId, token);
    expect(await settledAttempts(fx, orderId)).toHaveLength(1);
  });

  it("two card pages (two tabs): only the newest can be paid, the older one never charges", async () => {
    const fx = await fixture();
    const { orderId, token } = await onlineOrder(fx, "card");
    const first = await startCard(fx, orderId, token);
    const second = await startCard(fx, orderId, token);
    expect(second).not.toBe(first);
    expect((await payOnCardPage(fx, orderId, second)).kind).toBe("settled");
    // The first tab's page: closed when the second was opened.
    expect((await fake()).settleOrderCheckout(first)).toBeNull();
    expect(await settledAttempts(fx, orderId)).toEqual([{ provider: "stripe" }]);
    await expectEveryFurtherPaymentRefused(fx, orderId, token);
  });

  it("the old card page paid BEFORE switching: switching to PayPal takes that payment and refuses PayPal", async () => {
    const fx = await fixture();
    const { orderId, token } = await onlineOrder(fx, "card");
    const cardRef = await startCard(fx, orderId, token);
    (await fake()).settleOrderCheckout(cardRef); // money reserved on the card page
    expect(await createPayPalOrderPayment(fx.tenantId, orderId, token)).toEqual({
      ok: false,
      error: "already_paid",
    });
    expect(await read(fx, orderId)).toMatchObject({
      paymentStatus: "paid",
      paymentProvider: "stripe",
    });
    expect(await settledAttempts(fx, orderId)).toHaveLength(1);
  });

  // --------------------------------------------------- Online ↔ Cash

  it("Card → Cash: the old card page cannot charge the cash order", async () => {
    const fx = await fixture();
    const { orderId, token } = await onlineOrder(fx, "card");
    const cardRef = await startCard(fx, orderId, token);
    expect((await switchUnpaidOrderToCash(fx.tenantId, orderId, token)).ok).toBe(true);

    // The guest pays on the card tab they still have open.
    (await fake()).settleOrderCheckout(cardRef);
    const late = await processStripeOrderPayment(fx.tenantId, cardRef, {
      orderId,
      source: "webhook",
    });
    expect(late.kind).not.toBe("settled");
    expect(await stripeState(cardRef)).not.toBe("succeeded");

    const row = await read(fx, orderId);
    expect(row.paymentStatus).toBe("none");
    expect(await settledAttempts(fx, orderId)).toHaveLength(0);
  });

  it("PayPal → Cash: the approved PayPal payment is never captured afterwards", async () => {
    const fx = await fixture();
    const { orderId, token } = await onlineOrder(fx, "paypal");
    const paypalRef = await startPayPal(fx, orderId, token); // approved at PayPal
    expect((await switchUnpaidOrderToCash(fx.tenantId, orderId, token)).ok).toBe(true);

    expect(await finalizePayPalReturn(fx.tenantId, orderId)).toEqual({ paid: false });
    const late = await processPayPalOrderPayment(fx.tenantId, paypalRef, {
      orderId,
      source: "webhook",
    });
    expect(late.kind).not.toBe("settled");

    expect((await read(fx, orderId)).paymentStatus).toBe("none");
    expect(await settledAttempts(fx, orderId)).toHaveLength(0);
  });

  it("paid online, then Cash is tapped: refused as already paid", async () => {
    const fx = await fixture();
    const { orderId, token } = await onlineOrder(fx, "paypal");
    await startPayPal(fx, orderId, token);
    expect(await finalizePayPalReturn(fx.tenantId, orderId)).toEqual({ paid: true });
    expect(await switchUnpaidOrderToCash(fx.tenantId, orderId, token)).toEqual({
      ok: false,
      error: "already_paid",
    });
    expect((await read(fx, orderId)).paymentStatus).toBe("paid");
  });

  // ------------------------------------------------ copied / edited links

  it("a copied pay link with ?status=success does not make an unpaid order paid", async () => {
    // The pay page runs exactly this when it sees status=success: it ASKS
    // the payment provider, it never trusts the URL.
    const fx = await fixture();
    const { orderId, token } = await onlineOrder(fx, "card");
    await startCard(fx, orderId, token);
    for (let i = 0; i < 3; i++) {
      expect(await verifyOrderPayment(fx.tenantId, orderId, token)).toMatchObject({ paid: false });
    }
    expect((await read(fx, orderId)).paymentStatus).toBe("pending");
    expect(await settledAttempts(fx, orderId)).toHaveLength(0);
  });

  it("a link's token works for its own order only; an edited token works for none", async () => {
    const fx = await fixture();
    const a = await onlineOrder(fx, "card");
    const b = await onlineOrder(fx, "card");
    // Order A's link pointed at order B.
    expect(await createOrderPayment(fx.tenantId, b.orderId, a.token)).toEqual({
      ok: false,
      error: "invalid_token",
    });
    expect(await switchUnpaidOrderToCash(fx.tenantId, b.orderId, a.token)).toEqual({
      ok: false,
      error: "invalid_token",
    });
    expect(await cancelUnpaidOrderByGuest(fx.tenantId, b.orderId, a.token)).toEqual({
      ok: false,
      error: "invalid_token",
    });
    // A hand-edited token (one character changed in the signature).
    const edited = a.token.slice(0, -1) + (a.token.endsWith("A") ? "B" : "A");
    expect(await createOrderPayment(fx.tenantId, a.orderId, edited)).toEqual({
      ok: false,
      error: "invalid_token",
    });
    expect((await read(fx, b.orderId)).paymentStatus).toBe("pending");
  });

  // --------------------------------------------------------- cancelled

  it("a cancelled order cannot be paid by any method", async () => {
    const fx = await fixture();
    const { orderId, token } = await onlineOrder(fx, "card");
    const cardRef = await startCard(fx, orderId, token);
    expect(await cancelUnpaidOrderByGuest(fx.tenantId, orderId, token)).toEqual({ ok: true });

    // No new payment page opens for a cancelled order.
    expect(await createOrderPayment(fx.tenantId, orderId, token)).toEqual({
      ok: false,
      error: "order_cancelled",
    });
    expect(await createOrderPaymentIntent(fx.tenantId, orderId, token)).toMatchObject({
      ok: false,
      error: "order_cancelled",
    });
    expect(await createPayPalOrderPayment(fx.tenantId, orderId, token)).toEqual({
      ok: false,
      error: "order_cancelled",
    });
    (await fake()).settleOrderCheckout(cardRef);
    const late = await processStripeOrderPayment(fx.tenantId, cardRef, {
      orderId,
      source: "webhook",
    });
    expect(late.kind).not.toBe("settled");
    expect((await read(fx, orderId)).paymentStatus).not.toBe("paid");
    expect(await settledAttempts(fx, orderId)).toHaveLength(0);
  });
});
