import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "./env";
import { asTenant } from "./tenant";
import { sendEmail } from "./email";
import { uiLocale } from "./locales";
import { createLogger } from "./logger";
import { OrderCodeEmail, orderCodeSubject } from "@/emails/order-code-email";

const log = createLogger();

/**
 * Email proof for cash orders (owner, 2026-11-01).
 *
 * A cash pickup / delivery guest asks for a code at checkout; we mail six
 * digits to the address they typed. They type the code back, and get a
 * short-lived SIGNED TOKEN for exactly that venue + address, which the
 * order then carries. `placeOrder` checks the token — not the code — so a
 * retried submit (lost response) never needs a second code, and the order
 * transaction never touches this table.
 *
 *   code   6 digits, hashed at rest, 10 minutes, 5 tries, deleted once used
 *   token  HMAC-signed { venue, email, exp }, 60 minutes — long enough to
 *          finish a basket, short enough not to be a standing credential
 */

const CODE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const TOKEN_TTL_SECONDS = 60 * 60;
const TOKEN_TAG = "elv.oe1";

const normalize = (email: string): string => email.trim().toLowerCase();

function hashCode(venueId: string, email: string, code: string): string {
  return createHash("sha256")
    .update(`${venueId}|${normalize(email)}|${code}`)
    .digest("hex");
}

function sign(encoded: string): string {
  return createHmac("sha256", env.SESSION_SECRET)
    .update(`${TOKEN_TAG}.${encoded}`)
    .digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** The proof an order carries: this address was verified for this venue. */
export function signOrderEmailToken(
  venueId: string,
  email: string,
  ttlSeconds: number = TOKEN_TTL_SECONDS,
): string {
  const payload = {
    v: venueId,
    e: normalize(email),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

/** True when `token` proves `email` for `venueId` and has not expired. */
export function checkOrderEmailToken(
  token: string | null | undefined,
  venueId: string,
  email: string | null | undefined,
): boolean {
  if (!token || !email) return false;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature || !safeEqual(signature, sign(encoded))) return false;
  try {
    const p = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
      v?: unknown;
      e?: unknown;
      exp?: unknown;
    };
    return (
      p.v === venueId &&
      p.e === normalize(email) &&
      typeof p.exp === "number" &&
      p.exp >= Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}

/**
 * Mail a fresh code. Any earlier code for the same venue + address is
 * replaced, so only the newest mail works — what a guest who tapped
 * "resend" expects. Throws only when the mail could not be sent.
 */
export async function sendOrderEmailCode(
  context: { tenantId: string; venueId: string },
  email: string,
  locale: string | null | undefined,
): Promise<void> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const address = normalize(email);
  const venueName = await asTenant(context.tenantId, async (tx) => {
    await tx.orderEmailCode.deleteMany({
      where: {
        OR: [{ venueId: context.venueId, email: address }, { expiresAt: { lt: new Date() } }],
      },
    });
    await tx.orderEmailCode.create({
      data: {
        tenantId: context.tenantId,
        venueId: context.venueId,
        email: address,
        codeHash: hashCode(context.venueId, address, code),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });
    const venue = await tx.venue.findFirst({
      where: { id: context.venueId },
      select: { name: true },
    });
    return venue?.name ?? "";
  });
  const lang = uiLocale(locale);
  await sendEmail({
    to: address,
    subject: orderCodeSubject(lang, code, venueName),
    react: OrderCodeEmail({ venueName, locale: lang, code }),
  });
  log.info("order_code.sent", { venueId: context.venueId });
}

export type VerifyCodeError = "invalid" | "expired" | "too_many";

/**
 * Check a typed code. Right → the row is deleted and the signed token is
 * returned. Wrong → one try is used up; after five the code is dead and
 * the guest asks for a new one. Missing or past its ten minutes →
 * `expired`, which the checkout words as "request a new code".
 */
export async function verifyOrderEmailCode(
  context: { tenantId: string; venueId: string },
  email: string,
  code: string,
): Promise<{ ok: true; token: string } | { ok: false; error: VerifyCodeError }> {
  const address = normalize(email);
  const typed = code.replace(/\D/g, "");
  return asTenant(context.tenantId, async (tx) => {
    const row = await tx.orderEmailCode.findFirst({
      where: { venueId: context.venueId, email: address },
      orderBy: { createdAt: "desc" },
    });
    if (!row || row.expiresAt.getTime() < Date.now()) {
      return { ok: false as const, error: "expired" as const };
    }
    if (row.attempts >= MAX_ATTEMPTS) return { ok: false as const, error: "too_many" as const };
    if (typed.length !== 6 || !safeEqual(hashCode(context.venueId, address, typed), row.codeHash)) {
      await tx.orderEmailCode.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 } },
      });
      return {
        ok: false as const,
        error: row.attempts + 1 >= MAX_ATTEMPTS ? ("too_many" as const) : ("invalid" as const),
      };
    }
    await tx.orderEmailCode.delete({ where: { id: row.id } });
    return { ok: true as const, token: signOrderEmailToken(context.venueId, address) };
  });
}
