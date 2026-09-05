/**
 * Dry-run-first importer for data/csulb-campus-places.csv.
 *
 * Read-only comparison:
 *   npm run campus-places:dry-run
 *
 * Database writes require both explicit flags:
 *   npm run campus-places:apply
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadEnvFile } from 'dotenv';

import {
  assertApplyAuthorized,
  compareCampusPlaces,
  destinationsEqual,
  mergeDestination,
  prepareCampusPlaces,
  type ExistingAlias,
  type ExistingDestination,
  type ExistingProviderRef,
  type ExistingSnapshot,
  type PreparedDestination,
} from './lib/campus-places-import.js';

const PAGE_SIZE = 1_000;
const DEFAULT_FILE = 'data/csulb-campus-places.csv';

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value === '') throw new Error(`${name} is required`);
  return value;
}

async function readAllRows<T>(
  queryPage: (from: number, to: number) => Promise<{
    data: T[] | null;
    error: { code?: string; message: string } | null;
  }>,
  table: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await queryPage(from, from + PAGE_SIZE - 1);
    if (result.error !== null) {
      if (result.error.code === 'PGRST205') {
        throw new Error(
          `${table} is unavailable. Apply and verify the approved campus schema first.`,
        );
      }
      throw new Error(`Could not read ${table}: ${result.error.message}`);
    }
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function readSnapshot(client: SupabaseClient): Promise<ExistingSnapshot> {
  const destinations = await readAllRows<ExistingDestination>(
    async (from, to) =>
      await client
        .from('campus_destinations')
        .select(
          'id,import_key,type,name,code,parent_destination_id,building_code,room_number,floor_number,latitude,longitude,outdoor_destination_latitude,outdoor_destination_longitude,source,source_id,source_url,searchable,active,metadata',
        )
        .order('id')
        .range(from, to),
    'campus_destinations',
  );
  const aliases = await readAllRows<ExistingAlias>(
    async (from, to) =>
      await client
        .from('destination_aliases')
        .select(
          'destination_id,alias,normalized_alias,source,source_id,searchable,metadata',
        )
        .order('destination_id')
        .range(from, to),
    'destination_aliases',
  );
  const providerRefs = await readAllRows<ExistingProviderRef>(
    async (from, to) =>
      await client
        .from('destination_provider_refs')
        .select(
          'destination_id,provider,scope,external_id,external_category_ids,source,source_url,metadata',
        )
        .order('destination_id')
        .range(from, to),
    'destination_provider_refs',
  );
  return { destinations, aliases, providerRefs };
}

function databasePayload(
  destination: ExistingDestination | Omit<ExistingDestination, 'id'>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...destination };
  delete payload.id;
  return payload;
}

async function upsertDestinations(
  client: SupabaseClient,
  sources: PreparedDestination[],
  existing: ExistingDestination[],
): Promise<Map<string, string>> {
  const existingByKey = new Map(existing.map((row) => [row.import_key, row]));
  const ids = new Map(existing.map((row) => [row.import_key, row.id]));

  for (const parentPass of [true, false]) {
    const payloads: Record<string, unknown>[] = [];
    for (const source of sources) {
      const isParentless = source.parent_import_key === null;
      if (isParentless !== parentPass) continue;
      const parentId =
        source.parent_import_key === null ? null : ids.get(source.parent_import_key);
      if (source.parent_import_key !== null && parentId === undefined) {
        throw new Error(
          `Cannot resolve parent ${source.parent_import_key} for ${source.import_key}`,
        );
      }
      const current = existingByKey.get(source.import_key);
      const merged = mergeDestination(source, current, parentId ?? null);
      if (current === undefined || !destinationsEqual(merged, current)) {
        payloads.push(databasePayload(merged));
      }
    }

    if (payloads.length === 0) continue;
    const result = await client
      .from('campus_destinations')
      .upsert(payloads, { onConflict: 'import_key' })
      .select('id,import_key');
    if (result.error !== null) {
      throw new Error(`Destination upsert failed: ${result.error.message}`);
    }
    for (const row of result.data as { id: string; import_key: string }[]) {
      ids.set(row.import_key, row.id);
    }
  }
  return ids;
}

async function upsertAliases(
  client: SupabaseClient,
  snapshot: ExistingSnapshot,
  ids: ReadonlyMap<string, string>,
  aliases: ReturnType<typeof prepareCampusPlaces>['aliases'],
): Promise<number> {
  const existingKeys = new Set(
    snapshot.aliases.map(
      (alias) => `${alias.destination_id}:${alias.normalized_alias.trim().toLowerCase()}`,
    ),
  );
  const payloads = aliases.flatMap((alias) => {
    const destinationId = ids.get(alias.destination_import_key);
    if (destinationId === undefined) {
      throw new Error(`No destination id for alias ${alias.alias}`);
    }
    const key = `${destinationId}:${alias.alias.trim().toLowerCase()}`;
    return existingKeys.has(key)
      ? []
      : [
          {
            destination_id: destinationId,
            alias: alias.alias,
            source: alias.source,
            source_id: alias.source_id,
            searchable: alias.searchable,
            metadata: alias.metadata,
          },
        ];
  });
  if (payloads.length === 0) return 0;
  const result = await client.from('destination_aliases').upsert(payloads, {
    onConflict: 'destination_id,normalized_alias',
    ignoreDuplicates: true,
  });
  if (result.error !== null) throw new Error(`Alias upsert failed: ${result.error.message}`);
  return payloads.length;
}

async function upsertProviderRefs(
  client: SupabaseClient,
  snapshot: ExistingSnapshot,
  ids: ReadonlyMap<string, string>,
  references: ReturnType<typeof prepareCampusPlaces>['providerRefs'],
): Promise<number> {
  const existingKeys = new Set(
    snapshot.providerRefs.map(
      (reference) =>
        `${reference.provider}:${reference.scope}:${reference.external_id}`,
    ),
  );
  const payloads = references.flatMap((reference) => {
    const key = `${reference.provider}:${reference.scope}:${reference.external_id}`;
    if (existingKeys.has(key)) return [];
    const destinationId = ids.get(reference.destination_import_key);
    if (destinationId === undefined) {
      throw new Error(`No destination id for ${reference.provider} reference`);
    }
    return [
      {
        destination_id: destinationId,
        provider: reference.provider,
        scope: reference.scope,
        external_id: reference.external_id,
        external_category_ids: reference.external_category_ids,
        source: reference.source,
        source_url: reference.source_url,
        metadata: reference.metadata,
      },
    ];
  });
  if (payloads.length === 0) return 0;
  const result = await client.from('destination_provider_refs').upsert(payloads, {
    onConflict: 'provider,scope,external_id',
    ignoreDuplicates: true,
  });
  if (result.error !== null) {
    throw new Error(`Provider-reference upsert failed: ${result.error.message}`);
  }
  return payloads.length;
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
  const csvText = await readFile(filePath, 'utf8');
  const prepared = prepareCampusPlaces(csvText);

  const url = requireEnvironment('SUPABASE_URL');
  const serviceRoleKey = requireEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  const client = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const snapshot = await readSnapshot(client);
  const report = compareCampusPlaces(prepared, snapshot);
  console.log(JSON.stringify(report, null, 2));

  if (!apply) return;
  assertApplyAuthorized(apply, approved);
  if (
    report.duplicateCount > 0 ||
    report.rejectedCount > 0 ||
    report.conflictingRecordCount > 0 ||
    report.missingParentCount > 0
  ) {
    throw new Error('Apply blocked because the dry-run contains unsafe rows');
  }

  const ids = await upsertDestinations(
    client,
    prepared.destinations,
    snapshot.destinations,
  );
  const aliasWrites = await upsertAliases(client, snapshot, ids, prepared.aliases);
  const providerRefWrites = await upsertProviderRefs(
    client,
    snapshot,
    ids,
    prepared.providerRefs,
  );
  console.log(
    JSON.stringify(
      {
        inserted: report.proposedInsertCount,
        updated: report.proposedUpdateCount,
        unchanged: report.unchangedCount,
        skipped:
          report.duplicateCount +
          report.rejectedCount +
          report.conflictingRecordCount +
          report.missingParentCount,
        incomplete: report.incompleteCount,
        rejected: report.rejectedCount,
        aliasWrites,
        providerRefWrites,
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
