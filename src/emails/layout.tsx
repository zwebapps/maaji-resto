/* eslint-disable @next/next/no-head-element, @next/next/no-img-element -- this is
   email HTML, not a Next page: a real <head> and plain <img> are exactly right. */
import type { CSSProperties, ReactNode } from "react";
import { siteUrl } from "@/lib/site-url";
import { uploadedImageUrl } from "@/lib/menu-images";
import { receiptCopy } from "@/lib/i18n/emails";
import { uiLocale } from "@/lib/locales";

/**
 * One frame for every email the app sends: the owner's design (2026-11-01,
 * docs: the order-confirmation mockup) on a warm cream page — the cream
 * banner on top (mother at the pot, "Maaji" lettering, halal seal, gold
 * rule), the email's own content in a pale card, and a dark-green footer
 * band with mandala corners, the tagline and a gold ornament. The order
 * confirmation (`receipt-email.tsx`) is built from the same pieces —
 * `EmailHeader`, `FooterBand` — plus its own "thank you" and order cards.
 *
 * Lettering and ornaments are IMAGES (`/brand/email-header.png`,
 * `/brand/email/*.png`, cut from the mockup) because custom fonts don't
 * survive Gmail/Outlook; every image has alt text or is decorative, and
 * everything a guest must read — order, prices, address, phone — is live
 * text. Table layout + inline styles only; the one <style> block only
 * hides ornaments and stacks columns on phones.
 *
 * Only the FRAME is shared. Each email keeps its own message.
 */

export const EMAIL = {
  /** Buttons, headings, amounts — the mockup's deep green. */
  accent: "#0d4a2c",
  accentDark: "#073b23",
  /** Border of highlighted boxes (vouchers, gift cards). */
  gold: "#e2c79a",
  /** Background of highlighted boxes ("delivering to", codes, payment note). */
  cream: "#fbf0db",
  card: "#fdfbf8",
  ink: "#1d3b2a",
  inkSoft: "#5e6f62",
  line: "#e6e2d8",
  positive: "#0d4a2c",
  positiveBg: "#e7efe0",
  warnBg: "#fbf0db",
  /** The page behind everything. */
  page: "#fefaf4",
  /** The "thank you" card. */
  soft: "#edf2e4",
  /** Table header band ("Item / Price"). */
  band: "#f7eedf",
  /** The total row. */
  total: "#eaeedf",
  /** Text on the cream payment note. */
  brown: "#6b4513",
  /** Text on the dark-green footer band. */
  footerInk: "#f3e4bf",
} as const;

const FONT = "Arial, 'Helvetica Neue', Helvetica, sans-serif";
const SANS = FONT;
export const EMAIL_FONT = FONT;
export const EMAIL_SERIF = "Georgia, 'Times New Roman', serif";

/** Phone-width tweaks. Clients that drop <style> just keep the desktop
 *  layout, which still fits: ornaments are small and columns wrap. */
export const EMAIL_CSS = `@media (max-width:520px){.m-hide{display:none!important}.m-stack{display:block!important;width:100%!important;border:0!important;padding:6px 4px!important}}`;

/** Absolute URL of one cut-out from the mockup (`/public/brand/email`). */
export function emailAsset(siteBase: string, name: string): string {
  return `${siteBase}/brand/email/${name}.png`;
}

export interface Brand {
  name: string;
  /** Absolute URL of a square logo, or null. Kept for callers; the frame's
   *  header is the brand image instead. */
  logoUrl: string | null;
  /** Absolute URL of a wide banner photo, or null. Kept for callers; never
   *  drawn (owner, 2026-09-30: one look everywhere). */
  bannerUrl: string | null;
  accent?: string | null;
}

/** Brand block for a venue with uploaded assets (receipts, kitchen tickets). */
export function venueBrand(venue: {
  name: string;
  logoKey?: string | null;
  bannerKey?: string | null;
  primaryColor?: string | null;
}): Brand {
  const base = siteUrl();
  return {
    name: venue.name,
    logoUrl: venue.logoKey ? `${base}${uploadedImageUrl(venue.logoKey, 192)}` : null,
    bannerUrl: venue.bannerKey ? `${base}${uploadedImageUrl(venue.bannerKey, 1280)}` : null,
    accent: venue.primaryColor ?? null,
  };
}

/** Brand block for platform emails (account, billing): the deployment's own
 *  logo from /public/brand, which is the restaurant's in a white-label build. */
export function platformBrand(name: string): Brand {
  return { name, logoUrl: `${siteUrl()}/brand/logo-192.png`, bannerUrl: null, accent: null };
}

/** The cream banner. Without a site origin (fixtures) the name as text. */
export function EmailHeader({
  siteBase,
  name,
}: {
  siteBase: string;
  name: string;
}): React.ReactElement {
  return (
    <tr>
      <td align="center" style={{ padding: "0 0 14px" }}>
        {siteBase ? (
          <img
            src={`${siteBase}/brand/email-header.png`}
            width={600}
            alt={name}
            style={{
              display: "block",
              width: "100%",
              maxWidth: 600,
              height: "auto",
              border: 0,
              color: EMAIL.accent,
              fontFamily: EMAIL_SERIF,
              fontSize: 28,
              fontWeight: 700,
            }}
          />
        ) : (
          <p
            style={{
              fontFamily: EMAIL_SERIF,
              fontSize: 28,
              fontWeight: 700,
              color: EMAIL.accent,
              margin: 0,
            }}
          >
            {name}
          </p>
        )}
      </td>
    </tr>
  );
}

export interface FooterContact {
  address: string | null;
  phone: string | null;
  phoneHref: string | null;
}

/**
 * The dark-green band that closes a card: address · phone · website, the
 * tagline in serif italics, a gold ornament, optional small print. Mandala
 * corners frame it on wide screens. A row of the card's own table, so it
 * shares the card's rounded bottom corners.
 */
export function FooterBand({
  siteBase,
  dir,
  tagline,
  contact,
  note,
}: {
  siteBase: string;
  dir: "ltr" | "rtl";
  tagline: string;
  contact?: FooterContact | null;
  note?: ReactNode;
}): React.ReactElement {
  const site = siteBase.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const cells: { icon: string; body: ReactNode }[] = [];
  if (contact?.address) {
    cells.push({
      icon: "pin",
      body: contact.address.split("\n").map((l, i) => (
        <span key={i}>
          {i > 0 ? <br /> : null}
          {l}
        </span>
      )),
    });
  }
  if (contact?.phone && contact.phoneHref) {
    cells.push({
      icon: "phone",
      body: (
        <a
          href={contact.phoneHref}
          dir="ltr"
          style={{ color: "#ffffff", textDecoration: "none", unicodeBidi: "embed" }}
        >
          {contact.phone}
        </a>
      ),
    });
  }
  if (site) {
    cells.push({
      icon: "globe",
      body: (
        <a href={siteBase} style={{ color: "#ffffff", textDecoration: "none" }}>
          {site}
        </a>
      ),
    });
  }
  // The corner ornaments are drawn for the left/right edge: in Arabic the
  // table flips, so the images swap with it.
  const [mStart, mEnd] =
    dir === "rtl" ? ["mandala-end", "mandala-start"] : ["mandala-start", "mandala-end"];
  const ornament = (name: string, align: "left" | "right"): React.ReactElement => (
    <td
      className="m-hide"
      width={44}
      valign="top"
      align={align}
      style={{ width: 44, padding: 0, lineHeight: 0 }}
    >
      {siteBase ? (
        <img
          src={emailAsset(siteBase, name)}
          width={44}
          alt=""
          style={{ display: "block", width: 44, height: "auto", border: 0 }}
        />
      ) : null}
    </td>
  );
  return (
    <tr>
      <td style={{ backgroundColor: EMAIL.accentDark, padding: 0, borderRadius: "0 0 14px 14px" }}>
        <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
          <tbody>
            <tr>
              {ornament(mStart, dir === "rtl" ? "right" : "left")}
              <td align="center" style={{ padding: "16px 0 16px" }}>
                {cells.length > 0 ? (
                  <table
                    role="presentation"
                    cellPadding={0}
                    cellSpacing={0}
                    style={{ margin: "0 auto" }}
                  >
                    <tbody>
                      <tr>
                        {cells.map((c, i) => (
                          <td
                            key={c.icon}
                            className="m-stack"
                            valign="top"
                            style={{
                              padding: "2px 9px",
                              fontFamily: FONT,
                              fontSize: 12,
                              lineHeight: "18px",
                              color: "#ffffff",
                              [dir === "rtl" ? "borderRight" : "borderLeft"]:
                                i > 0 ? "1px solid #3f6650" : undefined,
                            }}
                          >
                            <table role="presentation" cellPadding={0} cellSpacing={0}>
                              <tbody>
                                <tr>
                                  <td
                                    valign="top"
                                    style={{
                                      padding: dir === "rtl" ? "0 0 0 6px" : "0 6px 0 0",
                                      lineHeight: 0,
                                    }}
                                  >
                                    {siteBase ? (
                                      <img
                                        src={emailAsset(siteBase, c.icon)}
                                        width={16}
                                        alt=""
                                        style={{
                                          display: "block",
                                          width: 16,
                                          height: "auto",
                                          border: 0,
                                        }}
                                      />
                                    ) : null}
                                  </td>
                                  <td
                                    valign="top"
                                    style={{
                                      fontFamily: FONT,
                                      fontSize: 12,
                                      lineHeight: "17px",
                                      color: "#ffffff",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {c.body}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                ) : null}
                <p
                  style={{
                    fontFamily: EMAIL_SERIF,
                    fontStyle: "italic",
                    fontSize: 20,
                    lineHeight: "26px",
                    color: EMAIL.footerInk,
                    textAlign: "center",
                    margin: cells.length > 0 ? "14px 0 4px" : "4px 0 4px",
                  }}
                >
                  {tagline}.
                </p>
                {siteBase ? (
                  <img
                    src={emailAsset(siteBase, "divider")}
                    width={186}
                    alt=""
                    style={{
                      display: "block",
                      width: 186,
                      height: "auto",
                      border: 0,
                      margin: "0 auto",
                    }}
                  />
                ) : null}
                {note ? (
                  <p
                    style={{
                      fontFamily: FONT,
                      fontSize: 11,
                      color: "#a9bfae",
                      textAlign: "center",
                      margin: "8px 0 0",
                    }}
                  >
                    {note}
                  </p>
                ) : null}
              </td>
              {ornament(mEnd, dir === "rtl" ? "left" : "right")}
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
  );
}

export function EmailShell({
  lang,
  dir,
  brand,
  title,
  children,
  footer,
}: {
  lang: string;
  dir: "ltr" | "rtl";
  brand: Brand;
  /** Also the hidden preheader most clients show next to the subject. */
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}): React.ReactElement {
  const siteBase = siteUrl();
  return (
    <html lang={lang} dir={dir}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width" />
        <meta name="color-scheme" content="light" />
        <title>{title}</title>
        <style>{EMAIL_CSS}</style>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: EMAIL.page, fontFamily: FONT }}>
        <div style={{ display: "none", maxHeight: 0, overflow: "hidden", opacity: 0 }}>{title}</div>
        <table
          role="presentation"
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{ backgroundColor: EMAIL.page }}
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
                    <EmailHeader siteBase={siteBase} name={brand.name} />
                    <tr>
                      <td style={{ padding: "0 16px" }}>
                        <table
                          role="presentation"
                          width="100%"
                          cellPadding={0}
                          cellSpacing={0}
                          style={{
                            backgroundColor: EMAIL.card,
                            border: `1px solid ${EMAIL.line}`,
                            borderRadius: 14,
                            borderCollapse: "separate",
                          }}
                        >
                          <tbody>
                            {/* The email's own content. */}
                            <tr>
                              <td
                                style={{
                                  padding: "22px 26px 24px",
                                  color: EMAIL.ink,
                                  fontSize: 15,
                                  lineHeight: 1.55,
                                  fontFamily: FONT,
                                }}
                              >
                                {children}
                              </td>
                            </tr>
                            <FooterBand
                              siteBase={siteBase}
                              dir={dir}
                              tagline={receiptCopy(uiLocale(lang)).tagline}
                            />
                          </tbody>
                        </table>
                      </td>
                    </tr>
                    {footer ? (
                      <tr>
                        <td
                          align="center"
                          style={{
                            padding: "14px 12px 0",
                            color: EMAIL.inkSoft,
                            fontSize: 12,
                            lineHeight: 1.5,
                            fontFamily: SANS,
                          }}
                        >
                          {footer}
                        </td>
                      </tr>
                    ) : null}
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

/* ---- Building blocks, all inline-styled ---- */

export const styles = {
  eyebrow: {
    margin: 0,
    color: EMAIL.inkSoft,
    fontSize: 11,
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    fontFamily: SANS,
  } as CSSProperties,
  h1: {
    margin: "4px 0 14px",
    fontSize: 26,
    lineHeight: 1.2,
    color: EMAIL.accentDark,
    fontFamily: FONT,
  } as CSSProperties,
  lead: { margin: "0 0 18px", fontSize: 15, color: EMAIL.ink } as CSSProperties,
  muted: { color: EMAIL.inkSoft, fontSize: 13 } as CSSProperties,
  hr: { border: 0, borderTop: `1px solid ${EMAIL.line}`, margin: "18px 0" } as CSSProperties,
  label: {
    padding: "6px 12px 6px 0",
    color: EMAIL.inkSoft,
    fontSize: 13,
    whiteSpace: "nowrap",
    verticalAlign: "top",
    fontFamily: SANS,
  } as CSSProperties,
  value: { padding: "6px 0", fontSize: 15, verticalAlign: "top" } as CSSProperties,
  itemCell: {
    padding: "9px 0",
    borderBottom: `1px solid ${EMAIL.line}`,
    fontSize: 15,
    verticalAlign: "top",
  } as CSSProperties,
  totalCell: { padding: "12px 0 4px", fontSize: 17, fontWeight: 700 } as CSSProperties,
};

/** A bulletproof button: a table cell with a background, so it renders as a
 *  button everywhere and stays a plain link where images are blocked. */
export function Button({
  href,
  label,
  tone = "accent",
}: {
  href: string;
  label: string;
  tone?: "accent" | "outline";
}): React.ReactElement {
  const solid = tone === "accent";
  return (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      style={{ display: "inline-table", margin: "6px 8px 6px 0" }}
    >
      <tbody>
        <tr>
          <td
            style={{
              borderRadius: 999,
              backgroundColor: solid ? EMAIL.accent : EMAIL.card,
              border: `2px solid ${EMAIL.accent}`,
              padding: "10px 20px",
              fontFamily: SANS,
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            <a
              href={href}
              style={{
                color: solid ? "#ffffff" : EMAIL.accent,
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              {label}
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** Status pill: settled (green) or open (warm). */
export function Pill({ text, tone }: { text: string; tone: "ok" | "warn" }): React.ReactElement {
  return (
    <span
      style={{
        display: "inline-block",
        borderRadius: 999,
        padding: "5px 12px",
        fontFamily: SANS,
        fontSize: 13,
        fontWeight: 700,
        backgroundColor: tone === "ok" ? EMAIL.positiveBg : EMAIL.warnBg,
        color: tone === "ok" ? EMAIL.positive : EMAIL.accentDark,
        border: `1px solid ${tone === "ok" ? EMAIL.positive : EMAIL.accent}`,
      }}
    >
      {text}
    </span>
  );
}
