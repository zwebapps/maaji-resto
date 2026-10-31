import { runPartitionMaintenance } from "../src/lib/partition-manager";

/**
 * Creates the monthly `audit_events` / `scan_stats` partitions for now and
 * the coming months — what the app does at boot (instrumentation.ts) — for
 * a database no app has started against yet (e.g. the local test DB).
 *
 *   DATABASE_URL=… pnpm exec tsx scripts/maintain-partitions.ts
 */
void runPartitionMaintenance().then((result) => {
  process.stdout.write(
    `partitions: ${result.created.length} created, ${result.archived.length} archived\n`,
  );
});
