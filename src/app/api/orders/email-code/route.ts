import { NextResponse } from "next/server";
import { z } from "zod";
import { corsPreflight, withCors } from "@/lib/cors";
import { resolvePreviewContext } from "@/lib/preview-context";
import { checkRateLimit, ORDER_CODE_EMAIL, ORDER_CODE_IP } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { sendOrderEmailCode } from "@/lib/order-email-code";
import { captureException } from "@/lib/observability";

/**
 * Mail a cash-order email code (owner, 2026-11-01). Public — the guest is
 * anonymous at checkout — so it is capped per IP and per address, and it
 * answers the same `{ ok: true }` for any well-formed address: whether a
 * mail was really sent is not something a caller learns here.
 */
const bodySchema = z.object({
  slug: z.string().min(1).max(120),
  email: z.string().trim().email().max(120),
  locale: z.string().max(10).optional(),
});

function limited(retryAfter: number): NextResponse {
  return withCors(
    NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    ),
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const ip = await checkRateLimit(ORDER_CODE_IP, clientIp(request));
  if (!ip.ok) return limited(ip.retryAfter);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return withCors(NextResponse.json({ error: "invalid" }, { status: 400 }));

  const context = await resolvePreviewContext(parsed.data.slug, null);
  if (!context || context.mode !== "public") {
    return withCors(NextResponse.json({ error: "unknown_venue" }, { status: 404 }));
  }
  const perEmail = await checkRateLimit(
    ORDER_CODE_EMAIL,
    `${context.venueId}:${parsed.data.email.toLowerCase()}`,
  );
  if (!perEmail.ok) return limited(perEmail.retryAfter);

  try {
    await sendOrderEmailCode(context, parsed.data.email, parsed.data.locale);
  } catch (err) {
    captureException(err, { where: "order-email-code.send", venueId: context.venueId });
    return withCors(NextResponse.json({ error: "send_failed" }, { status: 502 }));
  }
  return withCors(NextResponse.json({ ok: true }));
}

export function OPTIONS(): NextResponse {
  return corsPreflight();
}
