import { orderCodeCopy } from "@/lib/i18n/emails";
import { dirFor, type UiLocale } from "@/lib/locales";
import { EMAIL, EmailShell, platformBrand, styles } from "./layout";

/**
 * The 6-digit code a cash pickup / delivery guest types at checkout to
 * prove their email (owner, 2026-11-01). Sent from
 * `src/lib/order-email-code.ts`; the code is the whole message, so it is
 * big, spaced and selectable, and also the subject line — most phones
 * show it in the notification without opening the mail.
 */
export function orderCodeSubject(locale: UiLocale, code: string, venue: string): string {
  return orderCodeCopy(locale).subject(code, venue);
}

export function OrderCodeEmail({
  venueName,
  locale,
  code,
}: {
  venueName: string;
  locale: UiLocale;
  code: string;
}): React.ReactElement {
  const t = orderCodeCopy(locale);
  return (
    <EmailShell
      lang={locale}
      dir={dirFor(locale)}
      brand={platformBrand(venueName)}
      title={t.subject(code, venueName)}
      footer={t.notYou}
    >
      <p style={styles.eyebrow}>{t.eyebrow}</p>
      <h1 style={styles.h1}>{t.heading}</h1>
      <p style={styles.lead}>{t.lead}</p>
      <p
        dir="ltr"
        style={{
          margin: "0 0 18px",
          padding: "16px 12px",
          textAlign: "center",
          backgroundColor: EMAIL.soft,
          borderRadius: 12,
          fontFamily: "'Courier New', Courier, monospace",
          fontSize: 38,
          fontWeight: 700,
          letterSpacing: "0.3em",
          color: EMAIL.accentDark,
        }}
      >
        {code}
      </p>
      <p style={{ ...styles.muted, margin: 0 }}>{t.validFor}</p>
    </EmailShell>
  );
}
