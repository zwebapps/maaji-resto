-- Cash-order confirmation (owner, 2026-11-01): a cash pickup / delivery
-- guest proves their email with a mailed code, and staff confirm the
-- order by phone before it counts.

ALTER TABLE "orders" ADD COLUMN "needs_confirmation" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN "confirmed_at" TIMESTAMP(3);

CREATE TABLE "order_email_codes" (
  "id"         TEXT NOT NULL,
  "tenant_id"  TEXT NOT NULL,
  "venue_id"   TEXT NOT NULL,
  "email"      CITEXT NOT NULL,
  "code_hash"  TEXT NOT NULL,
  "attempts"   INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_email_codes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_email_codes_venue_id_fkey" FOREIGN KEY ("venue_id")
    REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "order_email_codes_venue_id_email_idx" ON "order_email_codes"("venue_id", "email");
CREATE INDEX "order_email_codes_expires_at_idx" ON "order_email_codes"("expires_at");

ALTER TABLE "order_email_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_email_codes" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "order_email_codes"
  USING (tenant_id = current_setting('app.current_tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'elvoria_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "order_email_codes" TO elvoria_app;
  END IF;
END
$$;
