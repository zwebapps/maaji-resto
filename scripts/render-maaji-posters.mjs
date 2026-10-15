/**
 * Renders the Maaji app-slider posters into public/app-slider/*.webp —
 * the built-in banners `src/lib/hero-slides.ts` serves (1080 × 540, 2 : 1).
 *
 *   node scripts/render-maaji-posters.mjs            # all four
 *   node scripts/render-maaji-posters.mjs points-de  # one
 *
 * One frame for every poster — peacock-teal ground, a faint gold lattice,
 * a double gold border, the Maaji lockup (mobile/assets/logo-cutout.png) on
 * the left — and a content panel per poster on the right, so the set reads
 * as one family on the slider.
 *
 * Every fact on a poster is a fact the code enforces, not marketing copy:
 *   points   — LOYALTY_DEFAULTS (src/lib/loyalty-config.ts): 5 points per
 *              order from 20 €, 100 points = a 20 € voucher. An owner who
 *              changes those settings must re-render or drop this poster.
 *   giftcard — GIFT_CARD_PURCHASE_DISCOUNT_PERCENT (src/lib/gift-card-config.ts).
 * No address or town: the venue's location is not set yet.
 *
 * Text is SVG rendered by sharp's librsvg with macOS system fonts
 * (Baskerville, Avenir Next). On another OS fontconfig substitutes, so
 * re-render on a Mac to get the same lettering.
 *
 * After replacing a poster, bump its `rev` in BUILT_IN_SLIDES — the app's
 * image cache never revalidates a URL it has seen.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const W = 1080;
const H = 540;

const C = {
  teal: "#0f4a47",
  tealDeep: "#0a3331",
  tealLift: "#17605b",
  cream: "#fdf6e6",
  creamSoft: "#e3d8bd",
  gold: "#e0b458",
  goldDeep: "#8f6410",
  ink: "#0f3b39",
};
const SERIF = "Baskerville";
const SANS = "Avenir Next";

const esc = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

async function dataUri(file, resize) {
  let img = sharp(path.join(ROOT, file));
  if (resize) img = img.resize(resize);
  const buf = await img.png().toBuffer();
  return `data:image/png;base64,${buf.toString("base64")}`;
}

/** A plate photo in a gold-ringed circle — the brand board's dish roundel. */
function roundel(id, href, cx, cy, r) {
  return `
    <clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
    <circle cx="${cx}" cy="${cy}" r="${r + 7}" fill="${C.tealDeep}" stroke="${C.gold}" stroke-width="3"/>
    <image href="${href}" x="${cx - r}" y="${cy - r * 1.55}" width="${r * 2}" height="${r * 3}"
      preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.gold}" stroke-width="2" opacity="0.7"/>`;
}

/** Small gold flourish: a line, a diamond, a line. */
function flourish(cx, y, half) {
  return `
    <line x1="${cx - half}" y1="${y}" x2="${cx - 12}" y2="${y}" stroke="${C.gold}" stroke-width="2"/>
    <rect x="${cx - 6}" y="${y - 6}" width="12" height="12" transform="rotate(45 ${cx} ${y})" fill="${C.gold}"/>
    <line x1="${cx + 12}" y1="${y}" x2="${cx + half}" y2="${y}" stroke="${C.gold}" stroke-width="2"/>`;
}

function frame(logo, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="ground" cx="30%" cy="40%" r="85%">
      <stop offset="0%" stop-color="${C.tealLift}"/>
      <stop offset="60%" stop-color="${C.teal}"/>
      <stop offset="100%" stop-color="${C.tealDeep}"/>
    </radialGradient>
    <pattern id="jali" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M24 2 L46 24 L24 46 L2 24 Z" fill="none" stroke="${C.gold}" stroke-width="1"/>
      <circle cx="24" cy="24" r="6" fill="none" stroke="${C.gold}" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#ground)"/>
  <rect width="${W}" height="${H}" fill="url(#jali)" opacity="0.07"/>
  <rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="26" fill="none" stroke="${C.gold}" stroke-width="3"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" rx="20" fill="none" stroke="${C.gold}" stroke-width="1" opacity="0.6"/>
  <image href="${logo}" x="40" y="70" width="300" height="300"/>
  ${flourish(190, 400, 110)}
  ${inner}
</svg>`;
}

function tagline(lines) {
  return lines
    .map(
      (l, i) =>
        `<text x="190" y="${448 + i * 34}" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-size="28" fill="${C.creamSoft}">${esc(l)}</text>`,
    )
    .join("");
}

/** Cream pill with ink text — the step cards and the CTA band. */
function pill(x, y, w, h, lines, { fill = C.cream, color = C.ink, size = 28, weight = 700 } = {}) {
  const lh = size * 1.18;
  const top = y + h / 2 - ((lines.length - 1) * lh) / 2 + size * 0.35;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="${fill}" stroke="${C.gold}" stroke-width="2"/>
    ${lines
      .map(
        (l, i) =>
          `<text x="${x + w / 2}" y="${top + i * lh}" text-anchor="middle" font-family="${SANS}" font-weight="${weight}" font-size="${size}" fill="${color}">${esc(l)}</text>`,
      )
      .join("")}`;
}

function arrow(x, y) {
  return `<path d="M${x} ${y - 12} L${x + 14} ${y} L${x} ${y + 12}" fill="none" stroke="${C.gold}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
}

const POSTERS = {
  async "points-de"({ logo }) {
    const X = 372;
    return frame(
      logo,
      `
      <text x="${X}" y="104" font-family="${SERIF}" font-weight="bold" font-size="48" fill="${C.cream}">Mehr bestellen,</text>
      <text x="${X}" y="186" font-family="${SERIF}" font-weight="bold" font-size="92" fill="${C.gold}">PUNKTE</text>
      <text x="${X + 410}" y="186" font-family="${SERIF}" font-weight="bold" font-size="48" fill="${C.cream}">sammeln!</text>
      ${pill(X, 222, 196, 132, ["Ab 20 €", "bestellen"], { size: 30 })}
      ${arrow(X + 206, 288)}
      ${pill(X + 230, 222, 196, 132, ["5 Punkte", "erhalten"], { size: 30 })}
      ${arrow(X + 436, 288)}
      ${pill(X + 460, 222, 196, 132, ["100 Punkte", "= 20 € Gutschein"], { size: 23 })}
      ${pill(X, 380, 656, 92, ["Pro Bestellung ab 20 € Bestellwert", "werden Ihre Punkte gutgeschrieben."], { fill: C.gold, color: C.tealDeep, size: 26 })}
      ${tagline(["Gutes Essen,", "große Belohnungen!"])}`,
    );
  },

  async "welcome-de"({ logo, dishes }) {
    const X = 380;
    return frame(
      logo,
      `
      <text x="${X}" y="98" font-family="${SERIF}" font-style="italic" font-size="34" fill="${C.creamSoft}">Herzlich willkommen bei</text>
      <text x="${X}" y="176" font-family="${SERIF}" font-weight="bold" font-size="80" fill="${C.gold}">Maaji</text>
      <text x="${X + 236}" y="176" font-family="${SERIF}" font-weight="bold" font-size="40" fill="${C.cream}">– mit Liebe serviert.</text>
      ${roundel("w1", dishes[0], X + 86, 300, 80)}
      ${roundel("w2", dishes[1], X + 318, 300, 80)}
      ${roundel("w3", dishes[4], X + 550, 300, 80)}
      <text x="${X + 318}" y="440" text-anchor="middle" font-family="${SANS}" font-weight="600" font-size="26" fill="${C.cream}">Authentische Küche · Frische Zutaten</text>
      <text x="${X + 318}" y="476" text-anchor="middle" font-family="${SANS}" font-weight="600" font-size="26" fill="${C.cream}">Traditionelle Rezepte · Mit Liebe serviert</text>
      ${tagline(["Authentischer Geschmack,", "traditionelle Rezepte"])}`,
    );
  },

  async "giftcard-de"({ logo }) {
    const X = 400;
    // The card itself: parchment, gold border, a gold ribbon and bow.
    return frame(
      logo,
      `
      <g transform="rotate(-4 700 200)">
        <rect x="${X + 20}" y="62" width="560" height="260" rx="22" fill="${C.cream}" stroke="${C.gold}" stroke-width="6"/>
        <rect x="${X + 34}" y="76" width="532" height="232" rx="16" fill="none" stroke="${C.goldDeep}" stroke-width="1.5" opacity="0.6"/>
        <rect x="${X + 440}" y="62" width="34" height="260" fill="${C.gold}"/>
        <ellipse cx="${X + 425}" cy="112" rx="34" ry="18" transform="rotate(-20 ${X + 425} 112)" fill="none" stroke="${C.goldDeep}" stroke-width="10"/>
        <ellipse cx="${X + 489}" cy="112" rx="34" ry="18" transform="rotate(20 ${X + 489} 112)" fill="none" stroke="${C.goldDeep}" stroke-width="10"/>
        <path d="M${X + 450} 124 L${X + 430} 170 M${X + 464} 124 L${X + 486} 170" stroke="${C.goldDeep}" stroke-width="10" stroke-linecap="round"/>
        <circle cx="${X + 457}" cy="120" r="14" fill="${C.goldDeep}"/>
        <text x="${X + 230}" y="170" text-anchor="middle" font-family="${SERIF}" font-weight="bold" font-size="56" fill="${C.ink}">GESCHENK</text>
        <text x="${X + 230}" y="232" text-anchor="middle" font-family="${SERIF}" font-weight="bold" font-size="56" fill="${C.ink}">KARTE</text>
        <text x="${X + 230}" y="282" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-size="26" fill="${C.goldDeep}">Maaji</text>
      </g>
      <rect x="${X}" y="360" width="600" height="120" rx="20" fill="${C.gold}" stroke="${C.cream}" stroke-width="2"/>
      <text x="${X + 300}" y="420" text-anchor="middle" font-family="${SANS}" font-weight="800" font-size="56" fill="${C.tealDeep}">5 % RABATT</text>
      <text x="${X + 300}" y="460" text-anchor="middle" font-family="${SANS}" font-weight="700" font-size="24" fill="${C.tealDeep}">BEI JEDEM GESCHENKKARTEN-KAUF</text>
      ${tagline(["Freude schenken –", "Genuss teilen"])}`,
    );
  },

  async "catering-de"({ logo, dishes }) {
    const X = 372;
    const occasions = ["Hochzeiten", "Geburtstage", "Firmenfeiern", "Familienfeste", "Jubiläen", "und vieles mehr"];
    return frame(
      logo,
      `
      <text x="${X}" y="96" font-family="${SERIF}" font-weight="bold" font-size="40" fill="${C.cream}">Wir bieten</text>
      <text x="${X}" y="172" font-family="${SERIF}" font-weight="bold" font-size="64" fill="${C.gold}">CATERING</text>
      <text x="${X}" y="218" font-family="${SERIF}" font-weight="bold" font-size="36" fill="${C.cream}">für jeden Anlass</text>
      ${roundel("c1", dishes[1], X + 76, 320, 70)}
      ${roundel("c2", dishes[2], X + 252, 320, 70)}
      ${occasions
        .map((o, i) => {
          const y = 66 + i * 64;
          return `<rect x="${X + 430}" y="${y}" width="230" height="52" rx="26" fill="${C.cream}" stroke="${C.gold}" stroke-width="2"/>
          <circle cx="${X + 454}" cy="${y + 26}" r="7" fill="${C.goldDeep}"/>
          <text x="${X + 472}" y="${y + 34}" font-family="${SANS}" font-weight="700" font-size="23" fill="${C.ink}">${esc(o)}</text>`;
        })
        .join("")}
      ${pill(X, 412, 400, 74, ["Jetzt Eventtermin anfragen"], { fill: C.gold, color: C.tealDeep, size: 27 })}
      ${tagline(["Leckeres Essen für", "Ihre besonderen Momente"])}`,
    );
  },
};

/**
 * The default gift-card pictures (DEFAULT_GIFT_CARD_PRODUCTS in
 * src/lib/gift-card-service.ts → public/brand/gift-cards/*.png, 1024 × 646).
 * No price or name on the art: both are owner-editable, so the picture must
 * never be able to disagree with them. Tier shows as 1 / 2 / 3 gold diamonds.
 */
const GIFT_CARDS = [
  ["kleine-freude", 1],
  ["genussabend", 2],
  ["festmahl", 3],
];

function giftCard(logo, tier) {
  const GW = 1024;
  const GH = 646;
  const diamonds = Array.from({ length: tier }, (_, i) => {
    const cx = 390 + (i - (tier - 1) / 2) * 46;
    return `<rect x="${cx - 11}" y="${GH - 92}" width="22" height="22" transform="rotate(45 ${cx} ${GH - 81})" fill="${C.gold}"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${GW}" height="${GH}" viewBox="0 0 ${GW} ${GH}">
  <defs>
    <radialGradient id="ground" cx="50%" cy="40%" r="80%">
      <stop offset="0%" stop-color="${C.tealLift}"/>
      <stop offset="60%" stop-color="${C.teal}"/>
      <stop offset="100%" stop-color="${C.tealDeep}"/>
    </radialGradient>
    <pattern id="jali" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M24 2 L46 24 L24 46 L2 24 Z" fill="none" stroke="${C.gold}" stroke-width="1"/>
      <circle cx="24" cy="24" r="6" fill="none" stroke="${C.gold}" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${GW}" height="${GH}" fill="url(#ground)"/>
  <rect width="${GW}" height="${GH}" fill="url(#jali)" opacity="0.07"/>
  <rect x="18" y="18" width="${GW - 36}" height="${GH - 36}" rx="34" fill="none" stroke="${C.gold}" stroke-width="5"/>
  <rect x="32" y="32" width="${GW - 64}" height="${GH - 64}" rx="26" fill="none" stroke="${C.gold}" stroke-width="1.5" opacity="0.6"/>
  <rect x="${GW - 230}" y="18" width="44" height="${GH - 36}" fill="${C.gold}" opacity="0.9"/>
  <ellipse cx="${GW - 245}" cy="96" rx="46" ry="24" transform="rotate(-20 ${GW - 245} 96)" fill="none" stroke="${C.goldDeep}" stroke-width="13"/>
  <ellipse cx="${GW - 171}" cy="96" rx="46" ry="24" transform="rotate(20 ${GW - 171} 96)" fill="none" stroke="${C.goldDeep}" stroke-width="13"/>
  <circle cx="${GW - 208}" cy="104" r="19" fill="${C.goldDeep}"/>
  <image href="${logo}" x="170" y="60" width="440" height="440"/>
  ${diamonds}
</svg>`;
}

async function main() {
  const only = process.argv[2];
  const logo = await dataUri("mobile/assets/logo-cutout.png", 600);
  const dishes = await Promise.all(
    [1, 2, 3, 4, 5].map((i) => dataUri(`public/dish_${i}.png`, 360)),
  );
  for (const [name, tier] of GIFT_CARDS) {
    if (only && only !== "gift-cards") continue;
    const out = path.join(ROOT, "public/brand/gift-cards", `${name}.png`);
    await sharp(Buffer.from(giftCard(logo, tier)))
      .png({ palette: true, quality: 85, effort: 10, compressionLevel: 9 })
      .toFile(out);
    process.stdout.write(`${name.padEnd(14)} → ${path.relative(ROOT, out)}\n`);
  }
  if (only === "gift-cards") return;
  for (const [name, render] of Object.entries(POSTERS)) {
    if (only && only !== name) continue;
    const svg = await render({ logo, dishes });
    const out = path.join(ROOT, "public/app-slider", `${name}.webp`);
    // Same encoding the shipped posters use: 1080 px, WebP q66.
    await sharp(Buffer.from(svg)).webp({ quality: 66 }).toFile(out);
    const { size } = await import("node:fs").then((fs) => fs.promises.stat(out));
    process.stdout.write(`${name.padEnd(12)} ${(size / 1024).toFixed(0)} KB → ${path.relative(ROOT, out)}\n`);
  }
}

await readFile(path.join(ROOT, "mobile/assets/logo-cutout.png")); // fail fast if the lockup is missing
await main();
