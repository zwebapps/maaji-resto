import { orderLabel } from "@/lib/order-label";
import { notFound } from "next/navigation";
import { sanitizeAppReturnUrl } from "@/lib/app-return";
import { getOrderForReceipt } from "@/lib/order-service";
import { getOperatorSettings } from "@/lib/operator-settings";
import { verifyReceiptToken } from "@/lib/receipt-token";
import { formatPrice } from "@/lib/public-menu";
import { PayButton } from "./pay-button";
import { AutoReceipt } from "./auto-receipt";
import { PayPalButton } from "./paypal-button";
import { PaymentExit } from "./payment-exit";
import { getGuestPaymentOptions, verifyOrderPayment } from "@/lib/connect-service";
import { getPublicVenueAccess } from "@/lib/order-service";
import { VAT_RATE_LABEL, vatFromGross } from "@/lib/vat";
import { postOrderCopy } from "@/lib/i18n/post-order";
import { dirFor, isLocaleCode, uiLocale } from "@/lib/locales";
import { menuThemeStyle, resolveMenuTheme } from "@/lib/menu-themes";
import { menuImageUrl } from "@/lib/menu-images";
import { CTA_LINK, CTA_PRIMARY, CTA_SECONDARY, SOFT_TEXT } from "./pay-ui";

/**
 * Local payment page. With the FAKE provider this is where the guest
 * "pays" (dev/CI end-to-end flow); with the real provider guests go to
 * Stripe-hosted checkout instead and only land here on the success
 * bounce (?status=success), where the page shows the settled state.
 * Access is gated by the order's HMAC receipt token.
 *
 * Language follows plan decision 5: a valid `?locale=` wins, else the
 * venue's default locale.
 */

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{
    token?: string;
    ref?: string;
    status?: string;
    app?: string;
    locale?: string;
  }>;
}): Promise<React.ReactElement> {
  const { orderId } = await params;
  const { token, ref, app, status: statusParam, locale: localeParam } = await searchParams;
  // Opened from the mobile app? Then the settled state leads back there.
  const appReturnUrl = sanitizeAppReturnUrl(app);
  if (!token) notFound();
  const verified = verifyReceiptToken(token);
  if (!verified || verified.orderId !== orderId) notFound();

  // Back from Stripe's page: the card is only reserved there. Confirm with
  // Stripe now — the server captures if every check passes — instead of
  // waiting for the webhook, so the guest sees the real state at once (and
  // a webhook outage changes nothing). Same path as the webhook; idempotent.
  if (statusParam === "success" && token) {
    await verifyOrderPayment(verified.tenantId, orderId, token).catch(() => null);
  }
  const order = await getOrderForReceipt(verified.tenantId, orderId);
  if (!order) notFound();

  const locale = uiLocale(isLocaleCode(localeParam) ? localeParam : order.venue.defaultLocale);
  const t = postOrderCopy(locale);
  const money = (cents: number): string => formatPrice(cents, order.currency, locale);
  const paid = order.paymentStatus === "paid";
  const vatCents = vatFromGross(order.totalCents);
  const orderNo = orderLabel(order);
  // P2-4: site kill switch — no new payments while paused (a settled order
  // still shows its paid state below).
  const { siteActive } = await getOperatorSettings();
  // "Payment not completed": try again / pay cash / cancel. The server
  // decides which apply (still placed, unpaid, online); opened on its own
  // when the guest has just come back from a failed or cancelled payment.
  const exit = await getGuestPaymentOptions(verified.tenantId, orderId);
  // Card and PayPal follow the owner's on/off switches in Billing.
  const access = order.venueId
    ? await getPublicVenueAccess(verified.tenantId, order.venueId)
    : null;
  const cardAvailable = access?.onlinePayment ?? false;
  const paypalOn = access?.paypalPayment ?? false;
  const cancelled = exit?.status === "cancelled";
  const switchedToCash = !paid && !cancelled && order.paymentStatus === "none";

  // The menu's own look (owner, 2026-11-15): the venue's theme variables,
  // its logo-and-name bar, and the cart's rounded buttons.
  const v = order.venue;
  const themeStyle = menuThemeStyle(v.theme, v.texture, v.backdrop, v.headingColor);
  const nameStyled = Boolean(resolveMenuTheme(v.theme).vars.nameColor);
  const logoSrc = v.logoKey
    ? menuImageUrl(v.logoKey, order.venueId ?? orderId, 96)
    : "/brand/logo-192.png";
  const menuHref = "/";
  const receiptHref = `/api/orders/${encodeURIComponent(orderId)}/receipt?token=${encodeURIComponent(token)}&locale=${locale}`;
  const trackHref = `/order-status/${encodeURIComponent(orderId)}?token=${encodeURIComponent(token)}&locale=${locale}`;
  // The copy carries its own tick ("Bezahlt ✓"); the badge draws one.
  const paidTitle = t.paid.replace(/\s*✓\s*$/, "");

  return (
    <div
      style={themeStyle}
      dir={dirFor(locale)}
      className="menu-theme flex min-h-screen flex-col bg-[var(--menu-bg)] text-[var(--menu-text)]"
    >
      {/* Same bar as the menu: logo + restaurant name, small, and a way back. */}
      <header className="border-b border-[var(--menu-text)]/10 bg-[var(--menu-bg)]/95">
        <div className="flex min-h-[3.5rem] items-center gap-2.5 px-4 py-3 sm:px-6 lg:px-12">
          <a
            href={menuHref}
            className="flex min-w-0 items-center gap-2.5 rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--menu-text)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoSrc}
              alt=""
              width={40}
              height={40}
              className={`h-10 w-10 shrink-0 ${v.logoKey ? "rounded-full object-cover" : ""}`}
            />
            <span
              className={`block min-w-0 truncate font-serif text-base leading-tight sm:text-lg ${
                nameStyled ? "font-semibold uppercase" : "italic"
              }`}
              style={{
                color: "var(--menu-name, var(--menu-text))",
                letterSpacing: nameStyled ? "0.08em" : undefined,
              }}
            >
              {order.venue.name}
            </span>
          </a>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-md rounded-2xl border border-[var(--menu-surface-text,var(--menu-text))]/10 bg-[var(--menu-surface)] p-6 text-[var(--menu-surface-text,var(--menu-text))] shadow-[0_24px_60px_-30px_rgba(0,0,0,0.5)] sm:p-7">
          <h1 className="text-center font-serif text-2xl leading-tight">
            {t.orderHeading(orderNo)}
          </h1>

          {/* The order, as a receipt: items, then the VAT split (German
              gross pricing — VAT is contained in the total). */}
          <div className="mt-5 rounded-xl bg-[var(--menu-surface-text,var(--menu-text))]/6 px-4 py-3 text-sm">
            <ul className="space-y-1.5">
              {order.items.map((item, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  <span className="min-w-6 font-bold tabular-nums text-[var(--menu-surface-accent,var(--menu-accent))]">
                    {item.quantity}×
                  </span>
                  <span className="min-w-0 flex-1">{item.name}</span>
                  <span className="tabular-nums">{money(item.priceCents * item.quantity)}</span>
                </li>
              ))}
            </ul>
            <div
              className={`mt-3 space-y-0.5 border-t border-[var(--menu-surface-text,var(--menu-text))]/12 pt-2 text-xs ${SOFT_TEXT}`}
            >
              <div className="flex justify-between gap-3">
                <span>{t.net}</span>
                <span className="tabular-nums">{money(order.totalCents - vatCents)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>{t.vatLine(VAT_RATE_LABEL)}</span>
                <span className="tabular-nums">{money(vatCents)}</span>
              </div>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-[var(--menu-surface-text,var(--menu-text))]/12 pt-2 font-semibold">
              <span className="text-xs uppercase tracking-[0.16em] rtl:normal-case rtl:tracking-normal">
                {t.total}
              </span>
              <span className="text-base tabular-nums">{money(order.totalCents)}</span>
            </div>
          </div>

          {paid ? (
            <section aria-live="polite" className="mt-6 text-center">
              <StatusBadge tone="positive" icon="check" />
              <p className="mt-3 font-serif text-2xl text-[var(--menu-positive)]">{paidTitle}</p>
              <p className={`mt-1 text-sm ${SOFT_TEXT}`}>{t.showAtRestaurant}</p>
              <div className="mt-5 space-y-2.5">
                {appReturnUrl ? (
                  <a href={appReturnUrl} className={CTA_PRIMARY}>
                    {t.backToApp}
                  </a>
                ) : null}
                <AutoReceipt
                  href={receiptHref}
                  filename={`${t.receiptFilePrefix}-${orderNo}.pdf`}
                  label={t.downloadReceipt}
                  className={appReturnUrl ? CTA_SECONDARY : CTA_PRIMARY}
                />
                <a href={trackHref} className={CTA_SECONDARY}>
                  {t.trackTitle}
                </a>
                {appReturnUrl ? null : (
                  <a href={menuHref} className={CTA_LINK}>
                    {t.backToMenu}
                  </a>
                )}
              </div>
            </section>
          ) : cancelled ? (
            <section aria-live="polite" className="mt-6 text-center">
              <StatusBadge tone="neutral" icon="cross" />
              <p className="mt-3 font-serif text-2xl">{t.exitCancelledTitle}</p>
              <p className={`mt-1 text-sm ${SOFT_TEXT}`}>{t.exitCancelledBody}</p>
              <div className="mt-5">
                <a href={menuHref} className={CTA_PRIMARY}>
                  {t.backToMenu}
                </a>
              </div>
            </section>
          ) : switchedToCash ? (
            <section aria-live="polite" className="mt-6 text-center">
              <StatusBadge tone="positive" icon="cash" />
              <p className="mt-3 font-serif text-2xl text-[var(--menu-positive)]">
                {t.exitCashDoneTitle}
              </p>
              <p className={`mt-1 text-sm ${SOFT_TEXT}`}>{t.exitCashDoneBody}</p>
              <div className="mt-5 space-y-2.5">
                {appReturnUrl ? (
                  <a href={appReturnUrl} className={CTA_PRIMARY}>
                    {t.backToApp}
                  </a>
                ) : null}
                <a href={trackHref} className={appReturnUrl ? CTA_SECONDARY : CTA_PRIMARY}>
                  {t.trackTitle}
                </a>
                <a href={receiptHref} className={CTA_SECONDARY}>
                  {t.downloadReceipt}
                </a>
                {appReturnUrl ? null : (
                  <a href={menuHref} className={CTA_LINK}>
                    {t.backToMenu}
                  </a>
                )}
              </div>
            </section>
          ) : !siteActive ? (
            <section aria-live="polite" className="mt-6 text-center">
              <StatusBadge tone="neutral" icon="pause" />
              <p className="mt-3 font-serif text-2xl">{t.paused}</p>
              <p className={`mt-1 text-sm ${SOFT_TEXT}`}>{t.pausedBody}</p>
              <div className="mt-5">
                <a href={menuHref} className={CTA_SECONDARY}>
                  {t.backToMenu}
                </a>
              </div>
            </section>
          ) : (
            <section className="mt-6 space-y-3">
              {ref ? (
                <PayButton
                  orderId={orderId}
                  token={token}
                  payRef={ref}
                  /* P7-16: the button gets WORDS, not a locale — importing the
                     catalogue from a client component ships all five. */
                  labels={{
                    pay: t.payAmount(money(order.totalCents)),
                    processing: t.processing,
                    failed: t.payFailed,
                    testNote: t.testPayPage,
                  }}
                />
              ) : null}
              {paypalOn ? (
                <PayPalButton
                  orderId={orderId}
                  token={token}
                  appReturnUrl={appReturnUrl}
                  labels={{
                    pay: t.payWithPaypal,
                    opening: t.openingPaypal,
                    failed: t.paypalFailed,
                  }}
                />
              ) : null}
              {!ref && !paypalOn && !exit?.canExit ? (
                <p className={`text-center text-sm ${SOFT_TEXT}`}>{t.incompleteLink}</p>
              ) : null}
              {exit?.canExit ? (
                <PaymentExit
                  orderId={orderId}
                  token={token}
                  acceptsCash={exit.acceptsCash}
                  cardAvailable={cardAvailable}
                  autoOpen={
                    statusParam === "cancelled" ||
                    statusParam === "failed" ||
                    order.paymentStatus === "failed"
                  }
                  labels={{
                    title: t.exitTitle,
                    body: t.exitBody,
                    tryCard: t.exitTryCard,
                    keepWindowOpen: t.exitKeepWindowOpen,
                    payCash: t.exitPayCash,
                    cancel: t.exitCancel,
                    cancelConfirm: t.exitCancelConfirm,
                    working: t.exitWorking,
                    stillProcessing: t.exitStillProcessing,
                    alreadyPaid: t.exitAlreadyPaid,
                    failed: t.exitFailed,
                    close: t.exitClose,
                    otherOptions: t.exitOtherOptions,
                  }}
                />
              ) : null}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * The round status mark above each outcome — drawn, not an emoji, so it
 * takes the theme's colours and reads the same on every platform.
 */
function StatusBadge({
  tone,
  icon,
}: {
  tone: "positive" | "neutral";
  icon: "check" | "cross" | "cash" | "pause";
}): React.ReactElement {
  const color =
    tone === "positive"
      ? "var(--menu-positive)"
      : "var(--menu-surface-text-soft, var(--menu-text-soft))";
  return (
    <span
      aria-hidden="true"
      className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2"
      style={{ borderColor: color, color }}
    >
      <svg
        viewBox="0 0 24 24"
        width="28"
        height="28"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {icon === "check" ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : null}
        {icon === "cross" ? <path d="M7 7l10 10M17 7L7 17" /> : null}
        {icon === "pause" ? <path d="M9 6v12M15 6v12" /> : null}
        {icon === "cash" ? (
          <>
            <rect x="3" y="6.5" width="18" height="11" rx="2" />
            <circle cx="12" cy="12" r="2.6" />
          </>
        ) : null}
      </svg>
    </span>
  );
}
