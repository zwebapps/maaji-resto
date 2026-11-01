import { NextResponse } from "next/server";
import { z } from "zod";
import { corsPreflight, withCors } from "@/lib/cors";
import { resolvePreviewContext } from "@/lib/preview-context";
import { checkRateLimit, ORDER_CODE_IP } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { verifyOrderEmailCode } from "@/lib/order-email-code";

/**
 * Check a cash-order email code. Right → `{ ok, emailToken }`, which the
 * checkout sends with the order. Wrong → 400 with `invalid` (try again),
 * `expired` (ask for a new code) or `too_many` (five wrong tries; ask for
 * a new code). Five tries per code plus the per-IP cap make guessing six
 * digits hopeless.
 */
const bodySchema = z.object({
  slug: z.string().min(1).max(120),
  email: z.string().trim().email().max(120),
  code: z.string().trim().min(1).max(20),
});

export async function POST(request: Request): Promise<NextResponse> {
  const rl = await checkRateLimit(ORDER_CODE_IP, `verify:${clientIp(request)}`);
  if (!rl.ok) {
    return withCors(
      NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      ),
    );
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return withCors(NextResponse.json({ error: "invalid" }, { status: 400 }));

  const context = await resolvePreviewContext(parsed.data.slug, null);
  if (!context || context.mode !== "public") {
    return withCors(NextResponse.json({ error: "unknown_venue" }, { status: 404 }));
  }
  const result = await verifyOrderEmailCode(context, parsed.data.email, parsed.data.code);
  if (!result.ok) return withCors(NextResponse.json({ error: result.error }, { status: 400 }));
  return withCors(NextResponse.json({ ok: true, emailToken: result.token }));
}

export function OPTIONS(): NextResponse {
  return corsPreflight();
}
