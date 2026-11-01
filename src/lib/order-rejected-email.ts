import { sendEmail } from "./email";
import { createLogger } from "./logger";
import { captureException } from "./observability";
import { getOrderForReceipt } from "./order-service";
import { orderLabel } from "./order-label";
import { uiLocale } from "./locales";
import { OrderRejectedEmail, orderRejectedSubject } from "@/emails/order-rejected-email";

const log = createLogger();

/**
 * Tell the guest their cash order was rejected after the confirmation
 * call (owner, 2026-11-01). Same language rule as the receipt; never
 * throws — the reject itself already happened.
 */
export async function sendOrderRejectedEmail(tenantId: string, orderId: string): Promise<boolean> {
  try {
    const order = await getOrderForReceipt(tenantId, orderId);
    if (!order?.customerEmail) return false;
    const locale = uiLocale(order.locale ?? order.customerLocale ?? order.venue.defaultLocale);
    const label = orderLabel(order);
    await sendEmail({
      to: order.customerEmail,
      subject: orderRejectedSubject(locale, label, order.venue.name),
      react: OrderRejectedEmail({
        venue: order.venue,
        locale,
        orderNumber: label,
        phone: order.venueFooter?.phone ?? null,
        phoneHref: order.venueFooter?.phoneHref ?? null,
      }),
    });
    log.info("order.rejected_emailed", { orderId, tenantId });
    return true;
  } catch (err) {
    captureException(err, { orderId, tenantId, where: "order-rejected-email" });
    return false;
  }
}
