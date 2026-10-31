import { randomUUID } from "node:crypto";

import { PrismaClient, type Allergen, type Dietary, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { normalizeImage } from "../src/lib/image-normalize";
import { writeUpload } from "../src/lib/image-storage";

/**
 * Rebuilds a venue's menu from ANOTHER resto deployment's LIVE public menu —
 * what its guests see right now: categories, dishes, prices, texts,
 * allergens, diets, spice, photos (downloaded at 1280 px) and every
 * language's names and descriptions — published here as a fresh version.
 *
 *   SOURCE_URL=https://rangla-punjab-restaurant.de TARGET_SLUG=maaji-restaurant \
 *   KEEP_CATEGORIES="Thali" \
 *   pnpm exec tsx --env-file=.env scripts/import-menu-from-live-site.ts
 *
 * Only public, anonymous GETs against the source (/api/v1/menu, /img) — it
 * cannot change anything there. The public menu lists only dishes served
 * TODAY, so weekday-only categories can be missing; KEEP_CATEGORIES carries
 * those over, by name, from the target's currently published menu (photos
 * and translations included). Offers are not copied (a promotion is the
 * source restaurant's own). The previous version stays in history.
 */

interface LiveItem {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  isAvailable: boolean;
  dineInOnly: boolean;
  allergens: Allergen[];
  traces: Allergen[];
  dietary: Dietary[];
  spice: number;
  photoUrl: string | null;
  variants: { name: string; priceDeltaCents: number }[];
}
interface LiveCategory {
  id: string;
  name: string;
  photoUrl: string | null;
  items: LiveItem[];
}
interface LiveMenu {
  venue: { defaultLocale: string; enabledLocales: string[] };
  categories: LiveCategory[];
}

const env = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
};

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return (await res.json()) as T;
}

/** The photo at the largest width the source's /img route allows. */
function fullSize(url: string): string {
  const u = new URL(url);
  u.searchParams.set("w", "1280");
  u.searchParams.delete("crop");
  return u.toString();
}

async function main(): Promise<void> {
  const source = env("SOURCE_URL").replace(/\/+$/, "");
  const targetSlug = env("TARGET_SLUG");
  const keep = (process.env.KEEP_CATEGORIES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const base = await getJson<LiveMenu>(`${source}/api/v1/menu?locale=de&fresh=1`);
  const defaultLocale = base.venue.defaultLocale;
  const others = base.venue.enabledLocales.filter((l) => l !== defaultLocale);
  const localized = new Map<string, LiveMenu>();
  for (const locale of others) {
    localized.set(
      locale,
      await getJson<LiveMenu>(`${source}/api/v1/menu?locale=${locale}&fresh=1`),
    );
  }

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
      select: { id: true, publishedVersion: true },
    });
    if (!menu) throw new Error(`default menu for "${targetSlug}" not found`);

    // Photos first, outside the transaction (network + disk).
    const photoKeyFor = new Map<
      string,
      { key: string; width: number; height: number; bytes: number }
    >();
    let failed = 0;
    const urls = base.categories.flatMap((c) => [c.photoUrl, ...c.items.map((i) => i.photoUrl)]);
    for (const url of urls) {
      if (!url || photoKeyFor.has(url)) continue;
      try {
        const res = await fetch(fullSize(url));
        if (!res.ok) throw new Error(String(res.status));
        const norm = await normalizeImage(Buffer.from(await res.arrayBuffer()));
        if (!norm.ok) throw new Error("not an image");
        const key = `${venue.tenantId}/uploads/${randomUUID()}`;
        await writeUpload(key, norm.bytes);
        photoKeyFor.set(url, {
          key,
          width: norm.width,
          height: norm.height,
          bytes: norm.bytes.length,
        });
      } catch {
        failed += 1;
      }
    }

    // Categories carried over from the target's current menu (e.g. weekday Thali).
    const kept =
      keep.length && menu.publishedVersion
        ? await prisma.category.findMany({
            where: { menuVersionId: menu.publishedVersion, name: { in: keep } },
            include: { items: { where: { deletedAt: null }, include: { variants: true } } },
          })
        : [];
    const keptIds = [...kept.map((c) => c.id), ...kept.flatMap((c) => c.items.map((i) => i.id))];
    const keptTranslations = keptIds.length
      ? await prisma.translation.findMany({ where: { entityId: { in: keptIds } } })
      : [];

    const result = await prisma.$transaction(
      async (tx) => {
        const mediaFor = new Map<string, string>();
        const media = async (url: string | null, alt: string): Promise<string | null> => {
          const photo = url ? photoKeyFor.get(url) : undefined;
          if (!photo) return null;
          const known = mediaFor.get(photo.key);
          if (known) return known;
          const row = await tx.media.create({
            data: {
              tenantId: venue.tenantId,
              storageKey: photo.key,
              width: photo.width,
              height: photo.height,
              bytes: photo.bytes,
              altText: alt.slice(0, 300) || null,
            },
            select: { id: true },
          });
          mediaFor.set(photo.key, row.id);
          return row.id;
        };

        const version = await tx.menuVersion.create({
          data: {
            tenantId: venue.tenantId,
            menuId: menu.id,
            status: "published",
            publishedAt: new Date(),
          },
          select: { id: true },
        });

        const newId = new Map<string, string>(); // source id → target id
        const translations: Prisma.TranslationCreateManyInput[] = [];
        let order = 100;
        let items = 0;

        // Kept categories lead, as they did on the source's printed menu.
        for (const c of kept) {
          const cat = await tx.category.create({
            data: {
              tenantId: venue.tenantId,
              menuVersionId: version.id,
              name: c.name,
              orderIndex: order,
              photoMediaId: c.photoMediaId,
            },
            select: { id: true },
          });
          order += 100;
          newId.set(c.id, cat.id);
          for (const i of c.items) {
            const row = await tx.item.create({
              data: {
                tenantId: venue.tenantId,
                categoryId: cat.id,
                name: i.name,
                description: i.description,
                priceCents: i.priceCents,
                currency: venue.currency,
                orderIndex: i.orderIndex,
                isAvailable: i.isAvailable,
                allergens: i.allergens,
                traces: i.traces,
                dietary: i.dietary,
                spice: i.spice,
                flags: i.flags ?? {},
                availableDays: i.availableDays,
                dineInOnly: i.dineInOnly,
                photoMediaId: i.photoMediaId,
                variants: {
                  create: i.variants.map((v) => ({
                    tenantId: venue.tenantId,
                    name: v.name,
                    priceDeltaCents: v.priceDeltaCents,
                    orderIndex: v.orderIndex,
                  })),
                },
              },
              select: { id: true },
            });
            newId.set(i.id, row.id);
            items += 1;
          }
        }
        for (const t of keptTranslations) {
          const entityId = newId.get(t.entityId);
          if (entityId) {
            translations.push({
              tenantId: venue.tenantId,
              entityType: t.entityType,
              entityId,
              locale: t.locale,
              field: t.field,
              value: t.value,
            });
          }
        }

        for (const c of base.categories) {
          if (keep.includes(c.name)) continue;
          const cat = await tx.category.create({
            data: {
              tenantId: venue.tenantId,
              menuVersionId: version.id,
              name: c.name,
              orderIndex: order,
              photoMediaId: await media(c.photoUrl, c.name),
            },
            select: { id: true },
          });
          order += 100;
          newId.set(c.id, cat.id);
          let itemOrder = 100;
          for (const i of c.items) {
            const row = await tx.item.create({
              data: {
                tenantId: venue.tenantId,
                categoryId: cat.id,
                name: i.name,
                description: i.description,
                priceCents: i.priceCents,
                currency: venue.currency,
                orderIndex: itemOrder,
                isAvailable: i.isAvailable,
                allergens: i.allergens,
                traces: i.traces,
                dietary: i.dietary,
                spice: i.spice,
                dineInOnly: i.dineInOnly,
                photoMediaId: await media(i.photoUrl, i.name),
                variants: {
                  create: i.variants.map((v, n) => ({
                    tenantId: venue.tenantId,
                    name: v.name,
                    priceDeltaCents: v.priceDeltaCents,
                    orderIndex: n,
                  })),
                },
              },
              select: { id: true },
            });
            itemOrder += 100;
            newId.set(i.id, row.id);
            items += 1;
          }
        }

        // Names/descriptions per language: the same ids across locales.
        for (const [locale, m] of localized) {
          for (const c of m.categories) {
            const entityId = newId.get(c.id);
            const de = base.categories.find((b) => b.id === c.id);
            if (entityId && de && c.name !== de.name) {
              translations.push({
                tenantId: venue.tenantId,
                entityType: "category",
                entityId,
                locale,
                field: "name",
                value: c.name,
              });
            }
            for (const i of c.items) {
              const id = newId.get(i.id);
              const deItem = de?.items.find((b) => b.id === i.id);
              if (!id || !deItem) continue;
              if (i.name !== deItem.name) {
                translations.push({
                  tenantId: venue.tenantId,
                  entityType: "item",
                  entityId: id,
                  locale,
                  field: "name",
                  value: i.name,
                });
              }
              if (i.description && i.description !== deItem.description) {
                translations.push({
                  tenantId: venue.tenantId,
                  entityType: "item",
                  entityId: id,
                  locale,
                  field: "description",
                  value: i.description,
                });
              }
            }
          }
        }
        if (translations.length)
          await tx.translation.createMany({ data: translations, skipDuplicates: true });

        await tx.menu.update({ where: { id: menu.id }, data: { publishedVersion: version.id } });
        return {
          version: version.id,
          categories: order / 100 - 1,
          items,
          photos: mediaFor.size,
          translations: translations.length,
        };
      },
      { timeout: 300_000, maxWait: 30_000 },
    );

    process.stdout.write(
      `✓ imported ${result.categories} categories / ${result.items} dishes from ${source} into "${targetSlug}"` +
        (kept.length ? ` (kept: ${kept.map((c) => c.name).join(", ")})` : "") +
        `\n  new photos ${result.photos} (download failures: ${failed}) · translations ${result.translations} · version ${result.version}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  process.stderr.write(
    `✗ import-menu-from-live-site failed: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
