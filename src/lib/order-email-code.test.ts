import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { env } from "./env";
import { signupUser } from "./auth-service";
import { asTenant } from "./tenant";
import { confirmCashOrder, placeOrder, rejectCashOrder } from "./order-service";
import {
  checkOrderEmailToken,
  sendOrderEmailCode,
  signOrderEmailToken,
  verifyOrderEmailCode,
} from "./order-email-code";
import { awaitingConfirmation } from "./order-status";

describe("cash-order email token", () => {
  it("proves one address for one venue, until it expires", () => {
    const token = signOrderEmailToken("venue-1", "Guest@Ex.com");
    expect(checkOrderEmailToken(token, "venue-1", "guest@ex.com")).toBe(true);
    expect(checkOrderEmailToken(token, "venue-2", "guest@ex.com")).toBe(false);
    expect(checkOrderEmailToken(token, "venue-1", "other@ex.com")).toBe(false);
    expect(checkOrderEmailToken(`${token}x`, "venue-1", "guest@ex.com")).toBe(false);
    expect(
      checkOrderEmailToken(signOrderEmailToken("venue-1", "g@ex.com", -1), "venue-1", "g@ex.com"),
    ).toBe(false);
    expect(checkOrderEmailToken(undefined, "venue-1", "g@ex.com")).toBe(false);
  });
});

describe.runIf(env.EMAIL_TRANSPORT === "mailhog")(
  "cash-order confirmation (owner, 2026-11-01)",
  () => {
    async function fixture(verifyCash: boolean): Promise<{
      userId: string;
      tenantId: string;
      venueId: string;
      publishedVersionId: string;
      itemId: string;
    }> {
      const s = await signupUser({
        email: `cc-${randomUUID()}@ex.com`,
        password: "S3cureP4ssPhrase!",
        tenantName: "Cash Confirm",
      });
      if (!s.ok) throw new Error("signup failed");
      return asTenant(s.tenantId, async (tx) => {
        const venue = await tx.venue.create({
          data: {
            tenantId: s.tenantId,
            name: "Confirm Venue",
            slug: `cc-${randomUUID().slice(0, 8)}`,
            currency: "EUR",
            defaultLocale: "de",
            ordering: { verifyCash },
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
            name: "Dal",
            priceCents: 990,
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

    /** RFC 2047: a non-ASCII subject ("für") arrives as encoded words. */
    function decodeSubject(raw: string): string {
      return raw.replace(/=\?UTF-8\?([BQ])\?([^?]*)\?=\s*/gi, (_, enc: string, text: string) =>
        enc.toUpperCase() === "B"
          ? Buffer.from(text, "base64").toString("utf8")
          : Buffer.from(
              text
                .replace(/_/g, " ")
                .replace(/=([0-9A-F]{2})/gi, (_m: string, h: string) =>
                  String.fromCharCode(parseInt(h, 16)),
                ),
              "latin1",
            ).toString("utf8"),
      );
    }

    /** The newest code MailHog received for this address. */
    async function codeFor(to: string): Promise<string> {
      const res = await fetch(`${env.MAILHOG_API_URL}/api/v2/messages`);
      const json = (await res.json()) as {
        items: { Content: { Headers: Record<string, string[]> } }[];
      };
      const mail = json.items.find((m) => (m.Content.Headers.To ?? []).some((h) => h.includes(to)));
      const subject = decodeSubject(mail?.Content.Headers.Subject?.[0] ?? "");
      const code = /\b(\d{6})\b/.exec(subject)?.[1];
      if (!code) throw new Error(`no code mailed to ${to}`);
      return code;
    }

    const pickup = (fx: { itemId: string }, email: string, emailToken?: string) => ({
      items: [{ itemId: fx.itemId, quantity: 1 }],
      orderType: "takeaway" as const,
      customerName: "Asha",
      customerPhone: "+49 761 000000",
      customerEmail: email,
      intendedPayment: "cash" as const,
      emailToken,
    });

    it("mails a code; a wrong one is refused, the right one yields the token", async () => {
      const fx = await fixture(true);
      const email = `code-${randomUUID()}@ex.com`;
      await sendOrderEmailCode(fx, email, "de");
      const code = await codeFor(email);

      const wrong = code === "000000" ? "111111" : "000000";
      expect(await verifyOrderEmailCode(fx, email, wrong)).toEqual({ ok: false, error: "invalid" });
      const right = await verifyOrderEmailCode(fx, email, code);
      expect(right.ok).toBe(true);
      if (right.ok) expect(checkOrderEmailToken(right.token, fx.venueId, email)).toBe(true);
      // Used up: the same code cannot be spent twice.
      expect(await verifyOrderEmailCode(fx, email, code)).toEqual({ ok: false, error: "expired" });
    });

    it("five wrong tries kill the code", async () => {
      const fx = await fixture(true);
      const email = `tries-${randomUUID()}@ex.com`;
      await sendOrderEmailCode(fx, email, "en");
      const code = await codeFor(email);
      const wrong = code === "000000" ? "111111" : "000000";
      for (let i = 0; i < 4; i++) await verifyOrderEmailCode(fx, email, wrong);
      expect(await verifyOrderEmailCode(fx, email, wrong)).toEqual({
        ok: false,
        error: "too_many",
      });
      expect(await verifyOrderEmailCode(fx, email, code)).toEqual({ ok: false, error: "too_many" });
    });

    it("a cash pickup order needs the token, then waits for the call; accepting starts it", async () => {
      const fx = await fixture(true);
      const email = `order-${randomUUID()}@ex.com`;
      expect(await placeOrder(fx, pickup(fx, email))).toEqual({
        ok: false,
        error: "email_unverified",
      });
      // A token for another address does not stand in.
      expect(
        await placeOrder(fx, pickup(fx, email, signOrderEmailToken(fx.venueId, "x@ex.com"))),
      ).toEqual({ ok: false, error: "email_unverified" });

      const placed = await placeOrder(
        fx,
        pickup(fx, email, signOrderEmailToken(fx.venueId, email)),
      );
      if (!placed.ok) throw new Error(`order failed: ${placed.error}`);
      const pending = await asTenant(fx.tenantId, (tx) =>
        tx.order.findFirstOrThrow({ where: { id: placed.value.orderId } }),
      );
      expect(pending.needsConfirmation).toBe(true);
      expect(awaitingConfirmation(pending)).toBe(true);

      expect(await confirmCashOrder(fx.userId, placed.value.orderId, 25)).toEqual({
        ok: true,
        minutes: 25,
      });
      const accepted = await asTenant(fx.tenantId, (tx) =>
        tx.order.findFirstOrThrow({ where: { id: placed.value.orderId } }),
      );
      expect(accepted.confirmedAt).not.toBeNull();
      expect(accepted.etaMinutes).toBe(25);
      expect(accepted.status).toBe("preparing");
      // Twice is a no-op, not a second accept.
      expect(await confirmCashOrder(fx.userId, placed.value.orderId, 30)).toEqual({
        ok: false,
        error: "not_applicable",
      });
    });

    it("rejecting cancels the order and emails the guest", async () => {
      const fx = await fixture(true);
      const email = `reject-${randomUUID()}@ex.com`;
      const placed = await placeOrder(
        fx,
        pickup(fx, email, signOrderEmailToken(fx.venueId, email)),
      );
      if (!placed.ok) throw new Error(`order failed: ${placed.error}`);

      expect(await rejectCashOrder(fx.userId, placed.value.orderId)).toEqual({ ok: true });
      const order = await asTenant(fx.tenantId, (tx) =>
        tx.order.findFirstOrThrow({ where: { id: placed.value.orderId } }),
      );
      expect(order.status).toBe("cancelled");
      expect(await confirmCashOrder(fx.userId, placed.value.orderId)).toEqual({
        ok: false,
        error: "not_applicable",
      });

      await new Promise((r) => setTimeout(r, 1000));
      const res = await fetch(`${env.MAILHOG_API_URL}/api/v2/messages`);
      const json = (await res.json()) as {
        items: { Content: { Headers: Record<string, string[]> } }[];
      };
      const subjects = json.items
        .filter((m) => (m.Content.Headers.To ?? []).some((h) => h.includes(email)))
        .map((m) => decodeSubject(m.Content.Headers.Subject?.[0] ?? ""));
      expect(subjects.some((sub) => sub.includes("konnte nicht angenommen werden"))).toBe(true);
    });

    it("leaves everything as before when the venue has it switched off, and dine-in always", async () => {
      const off = await fixture(false);
      const placed = await placeOrder(off, pickup(off, `off-${randomUUID()}@ex.com`));
      if (!placed.ok) throw new Error(`order failed: ${placed.error}`);
      const row = await asTenant(off.tenantId, (tx) =>
        tx.order.findFirstOrThrow({ where: { id: placed.value.orderId } }),
      );
      expect(row.needsConfirmation).toBe(false);

      const on = await fixture(true);
      const dineIn = await placeOrder(on, {
        items: [{ itemId: on.itemId, quantity: 1 }],
        orderType: "dine_in",
        tableNumber: "3",
      });
      expect(dineIn.ok).toBe(true);
    });
  },
);
