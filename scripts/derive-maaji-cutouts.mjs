/**
 * Derives the Maaji APP cut-outs (transparent, keyed off the mockup's teal welcome panel):
 *   logo-cutout.png → mobile/assets/logo-cutout.png (mark + MAAJI + tagline)
 *   mascot.png      → mobile/assets/mascot-thumbs-up.png (mark only)
 *
 *   mkdir -p $TMP && cp docs/brand/maaji-theme-mockup.jpg $TMP/mock.jpg && node scripts/derive-maaji-cutouts.mjs $TMP
 */
import sharp from "sharp";

// Scratch dir holding mock.jpg (a copy of docs/brand/maaji-theme-mockup.jpg); outputs land beside it.
const S = process.argv[2];
async function cut(left, top, width, height, out, size) {
  const { data } = await sharp(`${S}/mock.jpg`).extract({ left, top, width, height })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    const [r, g, b] = [data[p * 3], data[p * 3 + 1], data[p * 3 + 2]];
    // Teal ground: dark, blue/green well above red. Soft edge over a band.
    const teal = Math.min(g, b) - r;           // ~40-70 on the panel
    const lum = 0.3 * r + 0.59 * g + 0.11 * b;  // panel ~50-75
    const x = p % width, y = Math.floor(p / width);
    let a = 255;
    if (y < 44 && (x < 52 || x > width - 52)) a = 0;
    if (teal > 18 && lum < 110) a = lum < 90 ? 0 : Math.round(((lum - 90) / 20) * 255);
    rgba[p * 4] = r; rgba[p * 4 + 1] = g; rgba[p * 4 + 2] = b; rgba[p * 4 + 3] = a;
  }
  const img = await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const side = Math.max(width, height);
  await sharp(img).extend({ top: Math.floor((side - height) / 2), bottom: Math.ceil((side - height) / 2),
    left: Math.floor((side - width) / 2), right: Math.ceil((side - width) / 2), background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(size, size, { kernel: "lanczos3" }).png().toFile(out);
}
(async () => {
  // Woman + MAAJI wordmark + tagline (welcome panel), and woman alone.
  await cut(28 + 30, 272 + 92, 252, 240, `${S}/logo-cutout.png`, 857);
  await cut(28 + 74, 272 + 92, 180, 150, `${S}/mascot.png`, 360);
})();
