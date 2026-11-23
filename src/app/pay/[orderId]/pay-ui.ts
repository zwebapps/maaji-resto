/**
 * The pay page's look, in the MENU's design language (owner, 2026-11-15:
 * "make this page resemble the menu view"). Same tokens as the cart
 * drawer — the venue theme's CSS variables set by `menuThemeStyle` on the
 * page root — so a theme change in the dashboard restyles this page too.
 *
 * Plain strings, no runtime: imported by the server page and its client
 * buttons alike.
 */

/** Arabic is cursive — `uppercase` / letter-spacing only damage it. */
const RTL_TYPE = " rtl:normal-case rtl:tracking-normal";

export const FOCUS_RING =
  " focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--menu-surface-text,var(--menu-text))]";

const CTA_BASE =
  "block w-full rounded-full px-5 py-3.5 text-center text-sm uppercase tracking-[0.14em] transition disabled:cursor-not-allowed disabled:opacity-60" +
  RTL_TYPE;

/** The one dominant action (download the receipt, back to the app). */
export const CTA_PRIMARY =
  CTA_BASE +
  " bg-[var(--menu-surface-accent,var(--menu-accent))] font-semibold text-[var(--menu-on-surface-accent,var(--menu-bg))] hover:opacity-90 active:scale-[0.985]" +
  FOCUS_RING;

/** Paying: the theme's positive colour, like the cart's pay buttons. */
export const CTA_PAY =
  CTA_BASE +
  " bg-[var(--menu-positive)] font-semibold text-[var(--menu-on-positive,var(--menu-bg))] hover:opacity-90 active:scale-[0.985]" +
  FOCUS_RING;

/** A quiet wash — the second choice. */
export const CTA_SECONDARY =
  CTA_BASE +
  " bg-[var(--menu-surface-text,var(--menu-text))]/7 font-medium text-[var(--menu-surface-text,var(--menu-text))] hover:bg-[var(--menu-surface-text,var(--menu-text))]/13 active:scale-[0.985]" +
  FOCUS_RING;

/** Destructive (cancel the order): outlined in the theme's danger colour. */
export const CTA_DANGER =
  CTA_BASE +
  " border border-[var(--menu-danger)] font-medium text-[var(--menu-danger)] hover:opacity-90 active:scale-[0.985]" +
  FOCUS_RING;

/** Text-weight action under the buttons. */
export const CTA_LINK =
  "block w-full rounded-full px-5 py-2.5 text-center text-xs uppercase tracking-[0.14em] text-[var(--menu-surface-text-soft,var(--menu-text-soft))] underline decoration-1 underline-offset-4 transition hover:text-[var(--menu-surface-text,var(--menu-text))]" +
  RTL_TYPE +
  FOCUS_RING;

/**
 * PayPal's brand guidelines mandate the yellow / navy button — the one
 * place this page does not follow the theme. Rounded like the others.
 */
export const CTA_PAYPAL =
  "block w-full rounded-full border-2 border-[#003087] bg-[#ffc439] px-5 py-3.5 text-center text-sm font-bold uppercase tracking-[0.14em] text-[#003087] transition hover:opacity-90 active:scale-[0.985] disabled:opacity-60" +
  RTL_TYPE +
  FOCUS_RING;

/** Soft ink for secondary text on the card. */
export const SOFT_TEXT = "text-[var(--menu-surface-text-soft,var(--menu-text-soft))]";
