import type { ReceiptOrder } from "./order-service";
import { orderLabel } from "./order-label";
import { readUpload } from "./image-storage";
import { resizeImage } from "./image-resize";

/**
 * What the receipt PDF needs besides the order, shared by the download
 * route (`/api/orders/[id]/receipt`) and the confirmation email that
 * attaches the same file — so the attachment and the download are one
 * document, byte for byte.
 */

/** Venue logo as small PNG bytes, resized from the stored original with
 *  sharp. Any failure just means a text-only header. */
export async function receiptLogoPng(logoKey: string | null): Promise<Uint8Array | null> {
  if (!logoKey) return null;
  try {
    const original = await readUpload(logoKey);
    if (!original) return null;
    return new Uint8Array(await resizeImage(original, 200, "png"));
  } catch {
    return null;
  }
}

/** `receipt-maaji-restaurant-MJ-NVE9D.pdf` — the order code the guest sees
 *  in the email and on the tracker, not the internal running number. */
export function receiptPdfFilename(order: ReceiptOrder): string {
  const code = orderLabel(order).replace(/[^A-Za-z0-9-]/g, "");
  return `receipt-${order.venue.slug}-${code}.pdf`;
}
