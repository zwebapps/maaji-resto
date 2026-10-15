import { copyFile, mkdir, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { PrismaClient, type Allergen, type Dietary, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

import { UPLOAD_ROOT } from "../src/lib/image-storage";

/**
 * Copies a venue's LIVE published menu — categories, dishes, photos and
 * their translations — from another resto deployment's database into a
 * venue here, as a fresh published menu version.
 *
 *   SOURCE_DATABASE_URL=postgresql://…  \
 *   SOURCE_UPLOADS=/path/to/other-deploy/public/uploads \
 *   SOURCE_SLUG=rangla-punjab TARGET_SLUG=maaji-restaurant \
 *   pnpm exec tsx --env-file=.env scripts/copy-menu-from-venue.ts
 *
 * The SOURCE is only ever read, inside a READ ONLY transaction, so a typo
 * in the URLs can never write to the other restaurant. Photos are copied
 * byte-for-byte into this deploy's uploads under the target tenant's own
 * prefix with their own Media rows — tenants never share storage keys.
 *
 * Deliberately NOT copied: time-windowed offers (a promotion belongs to
 * the restaurant that ran it) and `source_item_id` lineage (it points at
 * the other database's rows). A missing photo file drops the photo, never
 * the dish. The target's previously published version stays in history.
 */

const env = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
};

interface SrcCategory {
  id: string;
  name: string;
  order_index: number;
  photo: SrcPhoto | null;
}
interface SrcPhoto {
  storage_key: string;
  width: number;
  height: number;
  bytes: number;
  alt_text: string | null;
  filename: string | null;
}
interface SrcItem {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  order_index: number;
  is_available: boolean;
  allergens: Allergen[];
  traces: Allergen[];
  dietary: Dietary[];
  spice: number;
  flags: Prisma.InputJsonValue;
  available_days: number[];
  dine_in_only: boolean;
  photo: SrcPhoto | null;
}
interface SrcVariant {
  item_id: string;
  name: string;
  price_delta_cents: number;
  order_index: number;
}
interface SrcTranslation {
  entity_type: "item" | "category";
  entity_id: string;
  locale: string;
  field: string;
  value: string;
}

/** Postgres enum arrays come back as "{a,b}" strings from node-pg. */
function pgArray<T extends string>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (typeof v !== "string" || v === "{}") return [];
  return v.slice(1, -1).split(",").filter(Boolean) as T[];
}

const PHOTO_SQL = `json_build_object('storage_key', m.storage_key, 'width', m.width, 'height', m.height,
  'bytes', m.bytes, 'alt_text', m.alt_text, 'filename', m.filename)`;

async function readSource(slug: string) {
  const client = new pg.Client({ connectionString: env("SOURCE_DATABASE_URL") });
  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const venue = await client.query<{
      id: string;
      tenant_id: string;
      published_version: string | null;
      default_locale: string;
      enabled_locales: string[] | string;
    }>(
      `SELECT v.id, v.tenant_id, m.published_version, v.default_locale, v.enabled_locales
         FROM venues v JOIN menus m ON m.venue_id = v.id AND m.is_default AND m."deletedAt" IS NULL
        WHERE v.slug = $1`,
      [slug],
    );
    const row = venue.rows[0];
    if (!row?.published_version) throw new Error(`source venue "${slug}" has no published menu`);
    const version = row.published_version;

    const categories = await client.query<SrcCategory>(
      `SELECT c.id, c.name, c.order_index,
              CASE WHEN m.id IS NULL OR m."deletedAt" IS NOT NULL THEN NULL ELSE ${PHOTO_SQL} END AS photo
         FROM categories c LEFT JOIN media m ON m.id = c.photo_media_id
        WHERE c.menu_version_id = $1 ORDER BY c.order_index, c.name`,
      [version],
    );
    const items = await client.query<SrcItem>(
      `SELECT i.id, i.category_id, i.name, i.description, i.price_cents, i.order_index, i.is_available,
              i.allergens::text[] AS allergens, i.traces::text[] AS traces, i.dietary::text[] AS dietary,
              i.spice, i.flags, i.available_days, i.dine_in_only,
              CASE WHEN m.id IS NULL OR m."deletedAt" IS NOT NULL THEN NULL ELSE ${PHOTO_SQL} END AS photo
         FROM items i JOIN categories c ON c.id = i.category_id
         LEFT JOIN media m ON m.id = i.photo_media_id
        WHERE c.menu_version_id = $1 AND i.deleted_at IS NULL
        ORDER BY i.order_index, i.name`,
      [version],
    );
    const variants = await client.query<SrcVariant>(
      `SELECT iv.item_id, iv.name, iv.price_delta_cents, iv.order_index
         FROM item_variants iv JOIN items i ON i.id = iv.item_id
         JOIN categories c ON c.id = i.category_id
        WHERE c.menu_version_id = $1 AND i.deleted_at IS NULL`,
      [version],
    );
    const ids = [...categories.rows.map((c) => c.id), ...items.rows.map((i) => i.id)];
    const translations = await client.query<SrcTranslation>(
      `SELECT entity_type, entity_id, locale, field, value FROM translations
        WHERE tenant_id = $1 AND entity_type IN ('item', 'category') AND entity_id = ANY($2)`,
      [row.tenant_id, ids],
    );
    await client.query("COMMIT");
    return {
      defaultLocale: row.default_locale,
      enabledLocales: pgArray<string>(row.enabled_locales),
      categories: categories.rows,
      items: items.rows.map((i) => ({
        ...i,
        allergens: pgArray<Allergen>(i.allergens),
        traces: pgArray<Allergen>(i.traces),
        dietary: pgArray<Dietary>(i.dietary),
      })),
      variants: variants.rows,
      translations: translations.rows,
    };
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const sourceSlug = env("SOURCE_SLUG");
  const targetSlug = env("TARGET_SLUG");
  const sourceUploads = path.resolve(env("SOURCE_UPLOADS"));
  if (sourceUploads === path.resolve(UPLOAD_ROOT)) {
    throw new Error("SOURCE_UPLOADS is this deploy's own uploads folder");
  }

  const src = await readSource(sourceSlug);
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
      select: { id: true },
    });
    if (!menu) throw new Error(`default menu for "${targetSlug}" not found`);

    // Files first, outside the transaction: a copy is idempotent and slow.
    const copied = new Map<string, string>(); // source storage key → target storage key
    let missing = 0;
    const photos = [...src.categories, ...src.items].flatMap((r) => (r.photo ? [r.photo] : []));
    for (const photo of photos) {
      if (copied.has(photo.storage_key)) continue;
      const from = path.resolve(sourceUploads, photo.storage_key);
      if (!from.startsWith(sourceUploads + path.sep)) continue;
      try {
        await stat(from);
      } catch {
        missing += 1;
        continue;
      }
      const key = `${venue.tenantId}/uploads/${randomUUID()}`;
      const to = path.join(UPLOAD_ROOT, key);
      await mkdir(path.dirname(to), { recursive: true });
      await copyFile(from, to);
      copied.set(photo.storage_key, key);
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const mediaFor = new Map<string, string>();
        const media = async (photo: SrcPhoto | null, alt: string): Promise<string | null> => {
          const key = photo ? copied.get(photo.storage_key) : undefined;
          if (!photo || !key) return null;
          const known = mediaFor.get(key);
          if (known) return known;
          const row = await tx.media.create({
            data: {
              tenantId: venue.tenantId,
              storageKey: key,
              width: photo.width,
              height: photo.height,
              bytes: photo.bytes,
              altText: (photo.alt_text ?? alt).slice(0, 300) || null,
              filename: photo.filename,
            },
            select: { id: true },
          });
          mediaFor.set(key, row.id);
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

        const newId = new Map<string, string>(); // source entity id → target id
        for (const c of src.categories) {
          const row = await tx.category.create({
            data: {
              tenantId: venue.tenantId,
              menuVersionId: version.id,
              name: c.name,
              orderIndex: c.order_index,
              photoMediaId: await media(c.photo, c.name),
            },
            select: { id: true },
          });
          newId.set(c.id, row.id);
        }
        for (const i of src.items) {
          const categoryId = newId.get(i.category_id);
          if (!categoryId) continue;
          const row = await tx.item.create({
            data: {
              tenantId: venue.tenantId,
              categoryId,
              name: i.name,
              description: i.description,
              priceCents: i.price_cents,
              currency: venue.currency,
              orderIndex: i.order_index,
              isAvailable: i.is_available,
              allergens: i.allergens,
              traces: i.traces,
              dietary: i.dietary,
              spice: i.spice,
              flags: i.flags ?? {},
              availableDays: i.available_days,
              dineInOnly: i.dine_in_only,
              photoMediaId: await media(i.photo, i.name),
            },
            select: { id: true },
          });
          newId.set(i.id, row.id);
        }
        const variants = src.variants.flatMap((v) => {
          const itemId = newId.get(v.item_id);
          return itemId
            ? [
                {
                  tenantId: venue.tenantId,
                  itemId,
                  name: v.name,
                  priceDeltaCents: v.price_delta_cents,
                  orderIndex: v.order_index,
                },
              ]
            : [];
        });
        if (variants.length) await tx.itemVariant.createMany({ data: variants });
        const translations = src.translations.flatMap((t) => {
          const entityId = newId.get(t.entity_id);
          return entityId
            ? [
                {
                  tenantId: venue.tenantId,
                  entityType: t.entity_type,
                  entityId,
                  locale: t.locale,
                  field: t.field,
                  value: t.value,
                },
              ]
            : [];
        });
        if (translations.length)
          await tx.translation.createMany({ data: translations, skipDuplicates: true });

        await tx.menu.update({ where: { id: menu.id }, data: { publishedVersion: version.id } });
        // The copied names are in the source's default language; follow it,
        // or the menu would label German dishes as English.
        await tx.venue.update({
          where: { id: venue.id },
          data: { defaultLocale: src.defaultLocale, enabledLocales: src.enabledLocales },
        });
        return {
          version: version.id,
          media: mediaFor.size,
          variants: variants.length,
          translations: translations.length,
        };
      },
      { timeout: 300_000, maxWait: 30_000 },
    );

    process.stdout.write(
      `✓ copied ${src.categories.length} categories / ${src.items.length} items from "${sourceSlug}" to "${targetSlug}"\n` +
        `  photos ${result.media} (missing files: ${missing}) · variants ${result.variants} · translations ${result.translations}\n` +
        `  locales ${src.defaultLocale} [${src.enabledLocales.join(", ")}] · version ${result.version}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  process.stderr.write(
    `✗ copy-menu-from-venue failed: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
