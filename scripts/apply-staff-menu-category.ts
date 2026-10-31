import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { normalizeImage } from "../src/lib/image-normalize";
import { writeUpload } from "../src/lib/image-storage";

/**
 * Brings ONE category of the target's published menu in line with another
 * resto deployment's STAFF menu export — every dish whatever its serving
 * days, which the public menu cannot give (it lists only today's dishes;
 * Rangla's weekday Thali never appears there on a Saturday, and each
 * weekday only shows that day's two).
 *
 *   STAFF_MENU_FILE=rangla-staff-menu.json CATEGORY=Thali TARGET_SLUG=maaji-restaurant \
 *   pnpm exec tsx --env-file=.env scripts/apply-staff-menu-category.ts
 *
 * STAFF_MENU_FILE is the JSON of the source's GET /api/v1/staff/menu
 * (fetched by its owner — this script never sees a credential). Dishes are
 * matched by name inside the category: name, description, price,
 * availability, dine-in-only, serving days and photo are written to the
 * target's PUBLISHED rows in place (the same live-field write the
 * dashboard's dish editor does — no new version). Photos come from the
 * source's public /img route at 1280 px. The category gets the first dish's
 * photo as its own picture when it has none. Dishes the source has and the
 * target lacks are added; the target's extras are left alone (reported).
 */

interface StaffItem {
  name: string;
  description: string | null;
  priceCents: number;
  isAvailable: boolean;
  dineInOnly: boolean;
  availableDays: number[];
  photoUrl: string | null;
}
interface StaffMenu {
  ok?: boolean;
  categories: { name: string; items: StaffItem[] }[];
}

const env = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
};

/** A placeholder ("no photo") URL from /img has no storage key in it. */
function realPhoto(url: string | null): string | null {
  if (!url) return null;
  return /\/img\/[^?]*uploads/.test(url) ? url : null;
}

async function main(): Promise<void> {
  const file = JSON.parse(readFileSync(env("STAFF_MENU_FILE"), "utf8")) as StaffMenu;
  const categoryName = env("CATEGORY");
  const targetSlug = env("TARGET_SLUG");
  const source = file.categories?.find((c) => c.name === categoryName);
  if (!source)
    throw new Error(
      `"${categoryName}" is not in the staff menu file (is it the JSON of /api/v1/staff/menu?)`,
    );

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env("DATABASE_URL") }),
  });
  try {
    const venue = await prisma.venue.findUnique({
      where: { slug: targetSlug },
      select: { id: true, tenantId: true, currency: true },
    });
    if (!venue) throw new Error(`target venue "${targetSlug}" not found`);
    const menu = await prisma.menu.findFirst({
      where: { venueId: venue.id, isDefault: true, deletedAt: null },
      select: { publishedVersion: true },
    });
    if (!menu?.publishedVersion) throw new Error(`"${targetSlug}" has no published menu`);
    const category = await prisma.category.findFirst({
      where: { menuVersionId: menu.publishedVersion, name: categoryName },
      include: { items: { where: { deletedAt: null } } },
    });
    if (!category) throw new Error(`"${categoryName}" is not on ${targetSlug}'s published menu`);

    // Download every real photo first (network + disk, outside the transaction).
    const photo = new Map<string, { key: string; width: number; height: number; bytes: number }>();
    let failed = 0;
    for (const item of source.items) {
      const url = realPhoto(item.photoUrl);
      if (!url || photo.has(url)) continue;
      try {
        const u = new URL(url);
        u.searchParams.set("w", "1280");
        u.searchParams.delete("crop");
        const res = await fetch(u);
        if (!res.ok) throw new Error(String(res.status));
        const norm = await normalizeImage(Buffer.from(await res.arrayBuffer()));
        if (!norm.ok) throw new Error("not an image");
        const key = `${venue.tenantId}/uploads/${randomUUID()}`;
        await writeUpload(key, norm.bytes);
        photo.set(url, { key, width: norm.width, height: norm.height, bytes: norm.bytes.length });
      } catch {
        failed += 1;
      }
    }

    const report = await prisma.$transaction(async (tx) => {
      const mediaFor = new Map<string, string>();
      const media = async (url: string | null, alt: string): Promise<string | null> => {
        const p = url ? photo.get(url) : undefined;
        if (!p) return null;
        const known = mediaFor.get(p.key);
        if (known) return known;
        const row = await tx.media.create({
          data: {
            tenantId: venue.tenantId,
            storageKey: p.key,
            width: p.width,
            height: p.height,
            bytes: p.bytes,
            altText: alt.slice(0, 300),
          },
          select: { id: true },
        });
        mediaFor.set(p.key, row.id);
        return row.id;
      };

      let updated = 0;
      let added = 0;
      let firstPhoto: string | null = null;
      let order = Math.max(0, ...category.items.map((i) => i.orderIndex)) + 100;
      for (const s of source.items) {
        const photoMediaId = await media(realPhoto(s.photoUrl), s.name);
        firstPhoto ??= photoMediaId;
        const data = {
          name: s.name,
          description: s.description,
          priceCents: s.priceCents,
          isAvailable: s.isAvailable,
          dineInOnly: s.dineInOnly,
          availableDays: s.availableDays,
          ...(photoMediaId ? { photoMediaId } : {}),
        };
        const existing = category.items.find((i) => i.name === s.name);
        if (existing) {
          await tx.item.update({ where: { id: existing.id }, data });
          updated += 1;
        } else {
          await tx.item.create({
            data: {
              ...data,
              tenantId: venue.tenantId,
              categoryId: category.id,
              currency: venue.currency,
              orderIndex: order,
            },
          });
          order += 100;
          added += 1;
        }
      }
      if (!category.photoMediaId && firstPhoto) {
        await tx.category.update({
          where: { id: category.id },
          data: { photoMediaId: firstPhoto },
        });
      }
      const extras = category.items
        .filter((i) => !source.items.some((s) => s.name === i.name))
        .map((i) => i.name);
      return {
        updated,
        added,
        photos: mediaFor.size,
        categoryPhoto: !category.photoMediaId && !!firstPhoto,
        extras,
      };
    });

    process.stdout.write(
      `✓ "${categoryName}" on ${targetSlug}: ${report.updated} dishes updated, ${report.added} added, ` +
        `${report.photos} photos (download failures: ${failed})` +
        (report.categoryPhoto ? ", category picture set" : "") +
        (report.extras.length
          ? `\n  not in the source, left as they are: ${report.extras.join(", ")}`
          : "") +
        "\n",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  process.stderr.write(
    `✗ apply-staff-menu-category failed: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
