import { NextResponse, type NextRequest } from "next/server";
import { corsPreflight, withCors } from "@/lib/cors";
import { rejectCashOrder } from "@/lib/order-service";
import { requireStaff, STAFF_NO_STORE } from "@/lib/staff-request";
import { getStaffOrder } from "@/lib/staff-service";

/**
 * POST /api/v1/staff/orders/{id}/reject — reject a cash order the
 * confirmation call could not confirm (owner, 2026-11-01). The order is
 * cancelled and the guest emailed. Accepting goes through …/accept, which
 * confirms a pending order with the chosen minutes.
 *
 *   404 not_found       — no such order in this restaurant
 *   409 not_applicable  — not (or no longer) waiting for its call
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const gate = await requireStaff(req, "orders");
  if (!gate.ok) return gate.response;

  const { id } = await ctx.params;
  const result = await rejectCashOrder(gate.staff.userId, id);
  if (!result.ok) {
    return withCors(
      NextResponse.json(
        { ok: false, error: result.error },
        { status: result.error === "not_found" ? 404 : 409 },
      ),
    );
  }
  const order = await getStaffOrder(gate.staff.userId, id);
  return withCors(NextResponse.json({ ok: true, order }, { headers: STAFF_NO_STORE }));
}

export function OPTIONS(): NextResponse {
  return corsPreflight();
}
