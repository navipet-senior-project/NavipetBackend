/**
 * Dry-run-first importer for the VEC door export (contract v2).
 *
 * Read-only comparison:
 *   npm run vec-points:dry-run -- --file=<path>
 *
 * Database writes require both explicit flags:
 *   npm run vec-points:apply -- --file=<path>
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadEnvFile } from 'dotenv';

import { assertApplyAuthorized } from './lib/campus-places-import.js';
import {
  compareVecPoints,
  prepareVecPoints,
  type ExistingVecPoint,
  type MultisetRef,
  type VecPointsReport,
  type VecRoom,
  type VecSnapshot,
} from './lib/vec-points-import.js';

const DEFAULT_FILE = 'data/vec-points.json';
const MAX_ROWS = 1_000;
const POINT_COLUMNS =
  'id,point_key,point_type,room_number,floor,x,y,z,heading_deg,map_provider,map_code,map_version,frame,destination_id,exported_at,active';

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value === '') throw new Error(`${name} is required`);
  return value;
}

function checkedRows<T>(
  result: { data: unknown; error: { code?: string; message: string } | null },
  table: string,
): T[] {
  if (result.error !== null) {
    if (result.error.code === 'PGRST205') {
      throw new Error(`${table} is unavailable. Apply and verify its migration first.`);
    }
    throw new Error(`Could not read ${table}: ${result.error.message}`);
  }
  const rows = (result.data ?? []) as T[];
  if (rows.length >= MAX_ROWS) {
    throw new Error(
      `${table} returned ${String(rows.length)} rows; add paging before importing`,
    );
  }
  return rows;
}

async function readSnapshot(client: SupabaseClient, mapCode: string): Promise<VecSnapshot> {
  const rooms = checkedRows<VecRoom>(
    await client
      .from('campus_destinations')
      .select('id,room_number,floor_number')
      .eq('building_code', 'VEC')
      .eq('type', 'room')
      .eq('active', true)
      .range(0, MAX_ROWS - 1),
    'campus_destinations',
  );
  const points = checkedRows<ExistingVecPoint>(
    await client
      .from('vec_destination_points')
      .select(POINT_COLUMNS)
      .eq('map_code', mapCode)
      .range(0, MAX_ROWS - 1),
    'vec_destination_points',
  );
  const multisetRefs = checkedRows<MultisetRef>(
    await client
      .from('destination_provider_refs')
      .select('destination_id,external_id')
      .eq('provider', 'multiset')
      .range(0, MAX_ROWS - 1),
    'destination_provider_refs',
  );
  return { rooms, points, multisetRefs };
}

function summary(report: VecPointsReport): Record<string, unknown> {
  return {
    mapCode: report.mapCode,
    mapVersion: report.mapVersion,
    insertCount: report.insert.length,
    updateCount: report.update.length,
    unchangedCount: report.unchangedCount,
    deactivateCount: report.deactivate.length,
    unmatchedCount: report.unmatched.length,
    floorMismatchCount: report.floorMismatches.length,
    skippedNonDoorCount: report.skippedNonDoorCount,
    danglingRefCount: report.danglingRefs.length,
    insert: report.insert.map((row) => row.point_key),
    update: report.update.map((row) => row.point_key),
    deactivate: report.deactivate,
    unmatched: report.unmatched,
    floorMismatches: report.floorMismatches,
    danglingRefs: report.danglingRefs,
  };
}

async function main(): Promise<void> {
  loadEnvFile({ quiet: true });
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const approved = args.has('--approved');
  const fileArgument = process.argv
    .slice(2)
    .find((argument) => argument.startsWith('--file='));
  const filePath = resolve(fileArgument?.slice('--file='.length) ?? DEFAULT_FILE);
  const prepared = prepareVecPoints(JSON.parse(await readFile(filePath, 'utf8')) as unknown);

  const client = createClient(
    requireEnvironment('SUPABASE_URL'),
    requireEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  const report = compareVecPoints(prepared, await readSnapshot(client, prepared.map_code));
  console.log(JSON.stringify(summary(report), null, 2));
  if (report.danglingRefs.length > 0) {
    console.warn('Warning: some VEC room multiset refs point at no active door key.');
  }

  if (!apply) return;
  assertApplyAuthorized(apply, approved);
  if (report.floorMismatches.length > 0) {
    throw new Error('Apply blocked because the dry-run contains floor mismatches');
  }

  // Deactivate first so the one-active-door-per-room index accepts new rows.
  const deactivateIds = report.deactivate.map((row) => row.id);
  if (deactivateIds.length > 0) {
    const result = await client
      .from('vec_destination_points')
      .update({ active: false })
      .in('id', deactivateIds);
    if (result.error !== null) {
      throw new Error(`Deactivation failed: ${result.error.message}`);
    }
  }

  const writes = [...report.insert, ...report.update];
  if (writes.length > 0) {
    const result = await client
      .from('vec_destination_points')
      .upsert(writes, { onConflict: 'map_code,map_version,point_key' });
    if (result.error !== null) {
      throw new Error(`Upsert failed: ${result.error.message}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        deactivated: deactivateIds.length,
        inserted: report.insert.length,
        updated: report.update.length,
        unchanged: report.unchangedCount,
        unmatched: report.unmatched.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
