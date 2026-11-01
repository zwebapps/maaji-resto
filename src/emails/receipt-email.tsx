import type { ReceiptOrder } from "@/lib/order-service";
import { orderLabel } from "@/lib/order-label";
import { orderDiscountLabel } from "@/lib/order-discount-label";
import { formatPrice } from "@/lib/public-menu";
import { receiptCopy } from "@/lib/i18n/emails";
import { dirFor, type UiLocale } from "@/lib/locales";
import { vatFromGross } from "@/lib/vat";
import { EMAIL, EMAIL_CSS, EMAIL_FONT, EmailHeader, FooterBand, emailAsset } from "./layout";

/* eslint-disable @next/next/no-head-element, @next/next/no-img-element -- email
   HTML, not a Next page: a real <head> and plain <img> are exactly right. */

/**
 * The order e-mail — what a guest receives the moment they order (cash) or
 * once an online payment settles. The owner's design (2026-11-01 mockup):
 * cream brand banner, a pale-green "thank you" card with corner flowers,
 * then one order card — number and date, the items under a beige header
 * band, net/VAT, the total on a green band, the payment note, the track
 * button, three promises with icons — closed by the dark-green footer band
 * with the restaurant's address, phone and site.
 *
 * Banner, flowers, icons and ornaments are images cut from the mockup
 * (`/public/brand/email`); every word and number is live text in the
 * guest's language (`src/lib/i18n/emails.ts`), and `dir` flips the whole
 * mail for Arabic. Same numbers as the PDF: gross prices, VAT contained.
 */
export interface ReceiptEmailProps {
  order: ReceiptOrder;
  locale: UiLocale;
  receiptUrl: string;
  trackUrl: string;
  /** Google's write-a-review form for this venue, or null when the owner
   *  has no Place ID saved / switched the rating off. */
  reviewUrl?: string | null;
  /** Absolute site origin for the header image and the footer's web link.
   *  Optional so fixtures keep working; the mailer always passes it. */
  siteBase?: string;
}

const C = EMAIL;
const FONT = EMAIL_FONT;

function orderNo(order: ReceiptOrder): string {
  return orderLabel(order);
}

export function receiptSubject(order: ReceiptOrder, locale: UiLocale): string {
  return receiptCopy(locale).subject(orderNo(order), order.venue.name);
}

function LinkButton({
  href,
  label,
  solid = false,
}: {
  href: string;
  label: string;
  solid?: boolean;
}): React.ReactElement {
  return (
    <a
      href={href}
      style={{
        display: "inline-block",
        margin: "6px 4px",
        padding: solid ? "14px 30px" : "12px 22px",
        borderRadius: 999,
        fontFamily: FONT,
        fontSize: solid ? 16 : 14,
        fontWeight: 700,
        textDecoration: "none",
        backgroundColor: solid ? C.accent : C.card,
        color: solid ? "#ffffff" : C.accent,
        border: `2px solid ${C.accent}`,
      }}
    >
      {label}
    </a>
  );
}

export function ReceiptEmail({
  order,
  locale,
  receiptUrl,
  trackUrl,
  reviewUrl = null,
  siteBase = "",
}: ReceiptEmailProps): React.ReactElement {
  const t = receiptCopy(locale);
  const dir = dirFor(locale);
  const start = dir === "rtl" ? ("right" as const) : ("left" as const);
  const end = dir === "rtl" ? ("left" as const) : ("right" as const);
  const money = (cents: number): string => formatPrice(cents, order.currency, locale);
  const vat = vatFromGross(order.totalCents);
  const net = order.totalCents - vat;
  const paid = order.paymentStatus === "paid";
  // A reward or gift card that covered the whole bill is "paid" without a
  // card ever being touched — the line names what actually paid.
  const paymentLine = paid
    ? order.paymentProvider === "gift_card"
      ? t.paidWithGiftCard
      : order.paymentProvider === "voucher"
        ? t.paidVoucher
        : order.paymentProvider === "paypal"
          ? t.paidPaypal
          : t.paidCard
    : order.orderType === "delivery"
      ? t.unpaidDelivery
      : order.orderType === "takeaway"
        ? t.unpaidPickup
        : t.unpaidDineIn;
  const placed = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "Europe/Berlin",
  }).format(order.createdAt);
  const placedTime = new Intl.DateTimeFormat(locale, {
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(order.createdAt);
  const when = order.requestedFor
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/Berlin",
      }).format(order.requestedFor)
    : t.asap;
  const whereLine =
    order.orderType === "dine_in"
      ? order.tableNumber
        ? `${t.table} ${order.tableNumber}`
        : null
      : `${order.orderType === "delivery" ? t.delivery : t.pickup} · ${t.planned} ${when}`;

  const img = (name: string): string => emailAsset(siteBase, name);
  const cell = { fontFamily: FONT, color: C.ink, fontSize: 15, padding: "9px 16px" };
  // A band across two cells: round only the outer corners, so it reads as
  // one pill in either reading direction.
  const bandStart = dir === "rtl" ? "0 10px 10px 0" : "10px 0 0 10px";
  const bandEnd = dir === "rtl" ? "10px 0 0 10px" : "0 10px 10px 0";
  const row = (label: React.ReactNode, value: string, style: object = {}): React.ReactElement => (
    <tr>
      <td style={{ ...cell, textAlign: start, ...style }}>{label}</td>
      <td style={{ ...cell, textAlign: end, whiteSpace: "nowrap", ...style }}>{value}</td>
    </tr>
  );
  // Corner flowers of the thank-you card, swapped with the reading direction.
  const [flowerStart, flowerEnd] =
    dir === "rtl" ? ["flower-end", "flower-start"] : ["flower-start", "flower-end"];
  const flower = (name: string): React.ReactElement => (
    <td
      className="m-hide"
      width={52}
      valign="top"
      style={{ width: 52, padding: "8px", lineHeight: 0 }}
    >
      {siteBase ? (
        <img
          src={img(name)}
          width={52}
          alt=""
          style={{ display: "block", width: 52, height: "auto", border: 0 }}
        />
      ) : null}
    </td>
  );
  const icon = (name: string, size: number, fallback: string): React.ReactNode =>
    siteBase ? (
      <img
        src={img(name)}
        width={size}
        alt=""
        style={{
          display: "inline-block",
          width: size,
          height: "auto",
          border: 0,
          verticalAlign: "middle",
        }}
      />
    ) : (
      fallback
    );

  return (
    <html lang={locale} dir={dir}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width" />
        <meta name="color-scheme" content="light" />
        <title>{t.heading(orderNo(order))}</title>
        <style>{EMAIL_CSS}</style>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: C.page }}>
        {/* Preheader: what most inboxes show beside the subject. */}
        <div style={{ display: "none", maxHeight: 0, overflow: "hidden", opacity: 0 }}>
          {t.received} {t.heading(orderNo(order))}
        </div>
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{ backgroundColor: C.page }}
        >
          <tbody>
            <tr>
              <td align="center" style={{ padding: "20px 10px" }}>
                <table
                  role="presentation"
                  width="600"
                  cellPadding={0}
                  cellSpacing={0}
                  dir={dir}
                  style={{ width: "100%", maxWidth: 600 }}
                >
                  <tbody>
                    {/* 1 · Brand banner. */}
                    <EmailHeader siteBase={siteBase} name={order.venue.name} />

                    {/* 2 · Thank you. */}
                    <tr>
                      <td style={{ padding: "0 16px 14px" }}>
                        <table
                          role="presentation"
                          width="100%"
                          cellPadding={0}
                          cellSpacing={0}
                          style={{ backgroundColor: C.soft, borderRadius: 16 }}
                        >
                          <tbody>
                            <tr>
                              {flower(flowerStart)}
                              <td align="center" style={{ padding: "18px 6px 22px" }}>
                                {siteBase ? (
                                  <img
                                    src={img("check")}
                                    width={64}
                                    alt=""
                                    style={{
                                      display: "block",
                                      width: 64,
                                      height: "auto",
                                      border: 0,
                                      margin: "0 auto",
                                    }}
                                  />
                                ) : (
                                  <span style={{ fontSize: 32, color: C.accent }}>✓</span>
                                )}
                                <h1
                                  style={{
                                    fontFamily: FONT,
                                    fontSize: 38,
                                    lineHeight: "44px",
                                    color: C.accentDark,
                                    margin: "10px 0 4px",
                                  }}
                                >
                                  {t.thankYou}
                                </h1>
                                <p
                                  style={{
                                    fontFamily: FONT,
                                    fontSize: 19,
                                    fontWeight: 700,
                                    color: C.accentDark,
                                    margin: "0 0 8px",
                                  }}
                                >
                                  {t.received}
                                </p>
                                <p
                                  style={{
                                    fontFamily: FONT,
                                    fontSize: 15,
                                    color: C.ink,
                                    margin: 0,
                                  }}
                                >
                                  {t.preparing}
                                </p>
                              </td>
                              {flower(flowerEnd)}
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>

                    {/* 3 · The order card, closed by the footer band. */}
                    <tr>
                      <td style={{ padding: "0 16px" }}>
                        <table
                          role="presentation"
                          width="100%"
                          cellPadding={0}
                          cellSpacing={0}
                          style={{
                            backgroundColor: C.card,
                            border: `1px solid ${C.line}`,
                            borderRadius: 14,
                            borderCollapse: "separate",
                          }}
                        >
                          <tbody>
                            <tr>
                              <td style={{ padding: "18px 12px 6px" }}>
                                <table
                                  role="presentation"
                                  width="100%"
                                  cellPadding={0}
                                  cellSpacing={0}
                                >
                                  <tbody>
                                    <tr>
                                      <td style={{ ...cell, textAlign: start, padding: "0 10px" }}>
                                        <span style={{ color: C.ink, fontSize: 14 }}>
                                          {t.orderNumber}
                                        </span>
                                        <br />
                                        <strong
                                          style={{
                                            fontSize: 30,
                                            lineHeight: "38px",
                                            color: C.accent,
                                          }}
                                        >
                                          #{orderNo(order)}
                                        </strong>
                                      </td>
                                      <td
                                        valign="top"
                                        style={{
                                          ...cell,
                                          textAlign: end,
                                          fontSize: 14,
                                          lineHeight: "22px",
                                          padding: "2px 10px 0",
                                        }}
                                      >
                                        {placed}
                                        <br />
                                        {placedTime}
                                      </td>
                                    </tr>
                                    {whereLine ? (
                                      <tr>
                                        <td
                                          colSpan={2}
                                          style={{
                                            ...cell,
                                            textAlign: start,
                                            padding: "8px 10px 12px",
                                            fontSize: 15,
                                          }}
                                        >
                                          {icon("bag", 18, "🛍️")}
                                          <span style={{ verticalAlign: "middle" }}>
                                            &nbsp; {whereLine}
                                          </span>
                                        </td>
                                      </tr>
                                    ) : null}
                                  </tbody>
                                </table>

                                {/* Items, adjustments, net/VAT, total. */}
                                <table
                                  role="presentation"
                                  width="100%"
                                  cellPadding={0}
                                  cellSpacing={0}
                                >
                                  <tbody>
                                    <tr>
                                      <td
                                        style={{
                                          ...cell,
                                          textAlign: start,
                                          fontWeight: 700,
                                          fontSize: 17,
                                          backgroundColor: C.band,
                                          borderRadius: bandStart,
                                          color: C.accentDark,
                                          padding: "12px 18px",
                                        }}
                                      >
                                        {t.item}
                                      </td>
                                      <td
                                        style={{
                                          ...cell,
                                          textAlign: end,
                                          fontWeight: 700,
                                          fontSize: 17,
                                          backgroundColor: C.band,
                                          borderRadius: bandEnd,
                                          color: C.accentDark,
                                          padding: "12px 18px",
                                        }}
                                      >
                                        {t.price}
                                      </td>
                                    </tr>
                                    <tr>
                                      <td colSpan={2} style={{ height: 6 }} />
                                    </tr>
                                    {order.items.map((item, i) => (
                                      <tr key={i}>
                                        <td
                                          style={{
                                            ...cell,
                                            textAlign: start,
                                            fontWeight: 700,
                                            fontSize: 16,
                                            color: C.accentDark,
                                          }}
                                        >
                                          {item.quantity} × {item.name}
                                        </td>
                                        <td
                                          style={{
                                            ...cell,
                                            textAlign: end,
                                            fontWeight: 700,
                                            fontSize: 16,
                                            color: C.accentDark,
                                            whiteSpace: "nowrap",
                                          }}
                                        >
                                          {money(item.priceCents * item.quantity)}
                                        </td>
                                      </tr>
                                    ))}
                                    {(order.orderDiscountCents ?? 0) > 0
                                      ? row(
                                          orderDiscountLabel(order.orderDiscountPercent, locale),
                                          `−${money(order.orderDiscountCents ?? 0)}`,
                                        )
                                      : null}
                                    {order.discountCents > 0
                                      ? row(
                                          order.discountPoints > 0
                                            ? t.rewardPoints(String(order.discountPoints))
                                            : t.reward,
                                          `−${money(order.discountCents)}`,
                                        )
                                      : null}
                                    {order.giftCardDiscountCents > 0
                                      ? row(
                                          order.giftCardLast4
                                            ? t.giftCardCode(order.giftCardLast4)
                                            : t.giftCard,
                                          `−${money(order.giftCardDiscountCents)}`,
                                        )
                                      : null}
                                    {row(t.net, money(net), {
                                      borderTop: `1px solid ${C.line}`,
                                      color: C.inkSoft,
                                      paddingTop: 14,
                                    })}
                                    {row(t.vat, money(vat), {
                                      color: C.inkSoft,
                                      paddingTop: 0,
                                      paddingBottom: 12,
                                    })}
                                    <tr>
                                      <td
                                        style={{
                                          ...cell,
                                          textAlign: start,
                                          fontSize: 26,
                                          fontWeight: 700,
                                          color: C.accentDark,
                                          backgroundColor: C.total,
                                          borderRadius: bandStart,
                                          padding: "12px 18px",
                                        }}
                                      >
                                        {t.total}
                                      </td>
                                      <td
                                        style={{
                                          ...cell,
                                          textAlign: end,
                                          fontSize: 26,
                                          fontWeight: 700,
                                          color: C.accentDark,
                                          backgroundColor: C.total,
                                          borderRadius: bandEnd,
                                          whiteSpace: "nowrap",
                                          padding: "12px 18px",
                                        }}
                                      >
                                        {money(order.totalCents)}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>

                                {/* How it is paid. */}
                                <table
                                  role="presentation"
                                  width="100%"
                                  cellPadding={0}
                                  cellSpacing={0}
                                  style={{ marginTop: 18 }}
                                >
                                  <tbody>
                                    <tr>
                                      <td
                                        align="center"
                                        style={{
                                          fontFamily: FONT,
                                          fontSize: 16,
                                          fontWeight: 700,
                                          padding: "12px 14px",
                                          borderRadius: 12,
                                          backgroundColor: paid ? C.positiveBg : C.cream,
                                          color: paid ? C.positive : C.brown,
                                        }}
                                      >
                                        {paid ? icon("check", 20, "✅") : icon("wallet", 26, "💳")}
                                        <span style={{ verticalAlign: "middle" }}>
                                          &nbsp; {paymentLine}
                                        </span>
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </td>
                            </tr>

                            {/* Tracking + receipt (+ the quiet review ask). */}
                            <tr>
                              <td align="center" style={{ padding: "12px 16px 4px" }}>
                                <LinkButton
                                  href={trackUrl}
                                  label={`${t.track}  ${dir === "rtl" ? "←" : "→"}`}
                                  solid
                                />
                                <br />
                                <LinkButton href={receiptUrl} label={t.pdf} />
                                {reviewUrl ? <LinkButton href={reviewUrl} label={t.rate} /> : null}
                              </td>
                            </tr>

                            {/* Three promises. */}
                            <tr>
                              <td style={{ padding: "18px 12px 22px" }}>
                                <table
                                  role="presentation"
                                  width="100%"
                                  cellPadding={0}
                                  cellSpacing={0}
                                >
                                  <tbody>
                                    <tr>
                                      {(
                                        [
                                          ["leaf", "🌿", t.featFresh],
                                          ["bowl", "🍲", t.featAuthentic],
                                          ["heart", "💚", t.featHospitality],
                                        ] as const
                                      ).map(([name, fallback, label], i) => (
                                        <td
                                          key={name}
                                          align="center"
                                          width="33%"
                                          valign="top"
                                          style={{
                                            fontFamily: FONT,
                                            fontSize: 12,
                                            lineHeight: "16px",
                                            fontWeight: 700,
                                            letterSpacing: 0.5,
                                            textTransform: "uppercase",
                                            color: C.accent,
                                            padding: "0 6px",
                                            // The divider sits between cells in either direction.
                                            [dir === "rtl" ? "borderRight" : "borderLeft"]:
                                              i > 0 ? `1px solid ${C.line}` : undefined,
                                          }}
                                        >
                                          {siteBase ? (
                                            <img
                                              src={img(name)}
                                              height={36}
                                              alt=""
                                              style={{
                                                display: "block",
                                                height: 36,
                                                width: "auto",
                                                border: 0,
                                                margin: "0 auto 8px",
                                              }}
                                            />
                                          ) : (
                                            <span style={{ fontSize: 26 }}>
                                              {fallback}
                                              <br />
                                            </span>
                                          )}
                                          {label}
                                        </td>
                                      ))}
                                    </tr>
                                  </tbody>
                                </table>
                              </td>
                            </tr>

                            {/* Where to find us. */}
                            <FooterBand
                              siteBase={siteBase}
                              dir={dir}
                              tagline={t.tagline}
                              contact={order.venueFooter ?? null}
                              note={`${t.notInvoice} · ${order.venue.name}`}
                            />
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}
