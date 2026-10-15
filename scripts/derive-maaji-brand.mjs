/**
 * Derives the Maaji WEB masters from the brand-board mockup (docs/brand/maaji-theme-mockup.jpg):
 *   maaji-logo.png            → public/brand/maaji-logo.png (woman + pot on white)
 *   maaji-icon.png            → public/brand/maaji-mobile-app-icon.png (launcher art on teal)
 * The mockup is ~1024 px wide, so these are upscaled placeholders until a high-res master arrives.
 *
 *   mkdir -p $TMP && cp docs/brand/maaji-theme-mockup.jpg $TMP/mock.jpg && node scripts/derive-maaji-brand.mjs $TMP
 */
import sharp from "sharp";

// Scratch dir holding mock.jpg (a copy of docs/brand/maaji-theme-mockup.jpg); outputs land beside it.
const S = process.argv[2];
const px = (d, w, x, y) => { const i = (y * w + x) * 3; return [d[i], d[i + 1], d[i + 2]]; };
(async () => {
  // Logo mark — woman + pot on white.
  const W = 184, H = 166;
  const { data, info } = await sharp(`${S}/mock.jpg`).extract({ left: 250, top: 12, width: W, height: H })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3; const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const bg = max > 200 && max - min < 60 && !(r > 220 && g < 190);
    const stray = (x < 45 && y < 70) || (x > 166 && y > 138) || (x > 150 && y > 150);
    if (bg || stray) data[i] = data[i + 1] = data[i + 2] = 255;
  }
  const mark = await sharp(data, { raw: info }).png().toBuffer();
  const side = 230;
  const logo = await sharp({ create: { width: side, height: side, channels: 3, background: "#ffffff" } })
    .composite([{ input: mark, left: Math.round((side - W) / 2) - 4, top: Math.round((side - H) / 2) }]).png().toBuffer();
  await sharp(logo).resize(1024, 1024, { kernel: "lanczos3" }).sharpen().png().toFile(`${S}/maaji-logo.png`);

  // Launcher icon — woman + MAAJI wordmark, arch corners painted out.
  const AW = 230, AH = 230;
  const a = await sharp(`${S}/mock.jpg`).extract({ left: 70, top: 354, width: AW, height: AH })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const d = a.data;
  for (let y = 0; y < AH; y++) for (let x = 0; x < AW; x++) {
    if ((y < 52 && (x < 36 || x > AW - 36)) || (y < 9 && (x < 62 || x > AW - 62))) {
      const [r, g, b] = px(d, AW, x < 34 ? 40 : AW - 40, Math.max(y, 54));
      const i = (y * AW + x) * 3; d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
  }
  const [r0, g0, b0] = px(d, AW, 3, 150);
  const bgHex = "#" + [r0, g0, b0].map((c) => c.toString(16).padStart(2, "0")).join("");
  const art = await sharp(d, { raw: a.info }).png().toBuffer();
  const icon = await sharp(art).extend({ top: 22, bottom: 22, left: 22, right: 22, background: bgHex }).png().toBuffer();
  await sharp(icon).blur(0.3).resize(1024, 1024, { kernel: "lanczos3" }).sharpen().png().toFile(`${S}/maaji-icon.png`);
  console.log("icon bg", bgHex);
})();
