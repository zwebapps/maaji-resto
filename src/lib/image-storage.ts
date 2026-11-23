import { mkdir, readFile, writeFile, copyFile, unlink, rm } from "node:fs/promises";
import path from "node:path";
import { deleteVariants } from "./image-cache";

/**
 * Local-disk image storage. White-label, single-restaurant deploy: there
 * is no object store (S3/R2) and no Cloudflare — uploaded photos live on
 * the app's own disk under `public/uploads/`, and the `/img/[key]` route
 * reads + resizes them with sharp on the fly.
 *
 * Keys keep the historical shape (`{tenantId}/uploads/{uuid}`,
 * `templates/{uuid}`) so nothing else has to change; they map straight to
 * a path under the upload root. Every path is resolved and fenced inside
 * the root so a crafted key (`../../etc/passwd`) can never escape it.
 *
 * PROD NOTE: mount `public/uploads` as a volume — files written here at
 * runtime otherwise vanish on the next container redeploy. Include it in
 * backups (it is now the only home of customer images).
 */

// `turbopackIgnore` on every runtime path in this file: these are the
// customer uploads (a mounted volume in production). Without the marker
// Next traced the whole project — uploads, local DB dumps — into
// .next/standalone. See also outputFileTracingExcludes in next.config.ts.
export const UPLOAD_ROOT = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "uploads");

function resolveSafe(key: string): string {
  const full = path.resolve(/*turbopackIgnore: true*/ UPLOAD_ROOT, key);
  if (full !== UPLOAD_ROOT && !full.startsWith(UPLOAD_ROOT + path.sep)) {
    throw new Error("image-storage: key escapes upload root");
  }
  return full;
}

/** Write (or overwrite) an object's bytes, creating parent dirs. */
export async function writeUpload(key: string, bytes: Buffer): Promise<void> {
  const full = resolveSafe(key);
  await mkdir(/*turbopackIgnore: true*/ path.dirname(full), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ full, bytes);
}

/** Read an object's bytes, or null if it is not on disk. */
export async function readUpload(key: string): Promise<Buffer | null> {
  try {
    return await readFile(/*turbopackIgnore: true*/ resolveSafe(key));
  } catch {
    return null;
  }
}

/** Copy one object to a new key (used when cloning a template photo). */
export async function copyUpload(srcKey: string, destKey: string): Promise<void> {
  const dest = resolveSafe(destKey);
  await mkdir(/*turbopackIgnore: true*/ path.dirname(dest), { recursive: true });
  await copyFile(/*turbopackIgnore: true*/ resolveSafe(srcKey), dest);
}

/** Delete one object and every resized variant of it. */
export async function deleteUpload(key: string): Promise<void> {
  try {
    await unlink(/*turbopackIgnore: true*/ resolveSafe(key));
  } catch {
    /* already gone */
  }
  // Variants are derived data; a cached copy must never outlive the
  // original it came from (nor keep occupying disk after a purge).
  await deleteVariants(key);
}

/** Recursively delete everything under a key prefix (tenant purge). */
export async function deletePrefix(prefix: string): Promise<void> {
  await rm(/*turbopackIgnore: true*/ resolveSafe(prefix), { recursive: true, force: true });
  await deleteVariants(prefix);
}
