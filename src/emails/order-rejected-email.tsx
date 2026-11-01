import { orderRejectedCopy } from "@/lib/i18n/emails";
import { dirFor, type UiLocale } from "@/lib/locales";
import { EmailShell, styles, venueBrand } from "./layout";

/**
 * "We could not accept your order" — sent when staff reject a cash order
 * they could not confirm by phone (owner, 2026-11-01). Short and kind:
 * nothing was charged, here is how to reach us.
 */
export function orderRejectedSubject(locale: UiLocale, orderNumber: string, venue: string): string {
  return orderRejectedCopy(locale).subject(orderNumber, venue);
}

export function OrderRejectedEmail({
  venue,
  locale,
  orderNumber,
  phone,
  phoneHref,
}: {
  venue: { name: string; logoKey?: string | null; bannerKey?: string | null };
  locale: UiLocale;
  orderNumber: string;
  /** The restaurant's phone, for the "call us" line; null hides it. */
  phone: string | null;
  phoneHref: string | null;
}): React.ReactElement {
  const t = orderRejectedCopy(locale);
  return (
    <EmailShell
      lang={locale}
      dir={dirFor(locale)}
      brand={venueBrand(venue)}
      title={t.subject(orderNumber, venue.name)}
      footer={
        <>
          {t.footer}
          <br />
          {venue.name}
        </>
      }
    >
      <p style={styles.eyebrow}>{t.eyebrow}</p>
      <h1 style={styles.h1}>{t.heading}</h1>
      <p style={styles.lead}>{t.lead(orderNumber)}</p>
      <p style={{ margin: "0 0 14px" }}>{t.why}</p>
      <p style={{ ...styles.muted, margin: 0 }}>
        {t.callUs}
        {phone && phoneHref ? (
          <>
            {" "}
            <a href={phoneHref} dir="ltr" style={{ fontWeight: 700 }}>
              {phone}
            </a>
          </>
        ) : null}
      </p>
    </EmailShell>
  );
}
