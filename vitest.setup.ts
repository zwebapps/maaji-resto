import "dotenv/config";

// Tests create and DELETE restaurants; several suites clean up with
// `tenant.deleteMany({})` and rely on row-level security to scope that to
// their own tenant. Against a database whose app role bypasses RLS (any
// superuser — the local dev container's owner is one) that wipes EVERY
// restaurant: it emptied the local Maaji database once (2026-10-31). So a
// local run gets its own database (TEST_DATABASE_URL / TEST_APP_DATABASE_URL
// in .env), and nothing runs against a database not named for tests.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
// Suites assert absolute URLs against CI's origin; a dev .env may run the
// site elsewhere (Maaji: :3200).
if (process.env.TEST_APP_URL) process.env.APP_URL = process.env.TEST_APP_URL;
if (process.env.TEST_APP_DATABASE_URL) {
  process.env.APP_DATABASE_URL = process.env.TEST_APP_DATABASE_URL;
}
{
  const dbName = (url: string | undefined): string =>
    url ? decodeURIComponent(new URL(url).pathname.slice(1)) : "";
  const names = [dbName(process.env.DATABASE_URL), dbName(process.env.APP_DATABASE_URL)];
  if (!process.env.CI && names.some((n) => n && !/test/i.test(n))) {
    throw new Error(
      `Refusing to run tests against "${names.join('" / "')}" — not a test database. ` +
        "Set TEST_DATABASE_URL and TEST_APP_DATABASE_URL in .env (see scripts/setup-test-db.sh).",
    );
  }
}

// Tests must NEVER talk to real Stripe, no matter what keys a developer
// has in .env for manual test-mode checkouts. Stripping the pair here
// forces getStripeProvider() onto the in-memory fake for every suite —
// the same guarantee CI has (where the vars are simply absent).
delete process.env.STRIPE_SECRET_KEY;
delete process.env.PAYPAL_CLIENT_ID;
delete process.env.PAYPAL_CLIENT_SECRET;
delete process.env.PAYPAL_WEBHOOK_ID;
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_SECRET;
delete process.env.MICROSOFT_CLIENT_ID;
delete process.env.MICROSOFT_CLIENT_SECRET;
delete process.env.STRIPE_WEBHOOK_SECRET;

// `next/font` is a build-time loader — outside Next it is not callable. The
// components that load a font only need a class name back.
import { vi } from "vitest";
vi.mock("next/font/google", () => {
  const font = (): { className: string; variable: string; style: object } => ({
    className: "",
    variable: "",
    style: {},
  });
  return { Luckiest_Guy: font, Geist: font, Cormorant_Garamond: font };
});
