/**
 * Dry-run-first coordinate enrichment for CSULB buildings.
 *
 * Read-only preview:
 *   npm run campus-coordinates:dry-run
 *
 * Database writes require both explicit flags:
 *   npm run campus-coordinates:apply
 */
import { config as loadEnvFile } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

interface BuildingRow {
  id: string;
  name: string;
  code: string | null;
  latitude: number | null;
  longitude: number | null;
  outdoor_destination_latitude: number | null;
  outdoor_destination_longitude: number | null;
}

interface Candidate {
  id: string;
  name: string;
  code: string | null;
  latitude: number;
  longitude: number;
  matchedName: string;
  matchedAddress: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value === '') throw new Error(`${name} is required`);
  return value;
}

function completePair(latitude: number | null, longitude: number | null): boolean {
  return latitude !== null && longitude !== null;
}

function parseBbox(value: string): [number, number, number, number] {
  const values = value.split(',').map((part) => Number(part.trim()));
  if (values.length !== 4 || values.some((part) => !Number.isFinite(part))) {
    throw new Error('MAPBOX_SEARCH_BBOX must contain four comma-separated numbers');
  }
  const [west, south, east, north] = values as [number, number, number, number];
  if (west >= east || south >= north) throw new Error('MAPBOX_SEARCH_BBOX must be ordered west,south,east,north');
  return [west, south, east, north];
}

function inBbox(latitude: number, longitude: number, bbox: [number, number, number, number]): boolean {
  const [west, south, east, north] = bbox;
  return longitude >= west && longitude <= east && latitude >= south && latitude <= north;
}

function normalizedWords(value: string): Set<string> {
  return new Set(value.toLocaleLowerCase('en-US').match(/[a-z0-9]+/gu) ?? []);
}

function isPlausibleMatch(row: BuildingRow, matchedName: string, matchedAddress: string): boolean {
  const requested = normalizedWords(row.name);
  const matched = normalizedWords(matchedName);
  const overlap = [...requested].filter((word) => word.length >= 3 && matched.has(word));
  const campusMentioned = /csulb|california state university long beach|long beach/iu.test(matchedAddress);
  return campusMentioned && (overlap.length >= 2 || (row.code !== null && matched.has(row.code.toLocaleLowerCase('en-US'))));
}

async function findCandidate(
  row: BuildingRow,
  token: string,
  proximity: string,
  bbox: [number, number, number, number],
): Promise<Candidate | null> {
  const url = new URL('/search/searchbox/v1/forward', 'https://api.mapbox.com');
  const label = row.code === null ? row.name : `${row.name} (${row.code})`;
  url.searchParams.set('q', `${label}, CSULB, Long Beach, CA`);
  url.searchParams.set('limit', '10');
  url.searchParams.set('language', 'en');
  url.searchParams.set('country', 'US');
  url.searchParams.set('types', 'poi,address');
  url.searchParams.set('proximity', proximity);
  url.searchParams.set('bbox', bbox.join(','));
  url.searchParams.set('access_token', token);

  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Mapbox request failed with HTTP ${String(response.status)}`);
  const body = (await response.json()) as { features?: unknown };
  if (!Array.isArray(body.features)) return null;

  for (const rawFeature of body.features) {
    if (typeof rawFeature !== 'object' || rawFeature === null) continue;
    const feature = rawFeature as {
      geometry?: { coordinates?: unknown };
      properties?: { name?: unknown; full_address?: unknown; place_formatted?: unknown };
    };
    const coordinates = feature.geometry?.coordinates;
    if (!Array.isArray(coordinates) || typeof coordinates[0] !== 'number' || typeof coordinates[1] !== 'number') continue;
    const longitude = coordinates[0];
    const latitude = coordinates[1];
    if (!inBbox(latitude, longitude, bbox)) continue;
    const properties = feature.properties;
    const matchedName = typeof properties?.name === 'string' ? properties.name : '';
    const matchedAddress = typeof properties?.full_address === 'string'
      ? properties.full_address
      : typeof properties?.place_formatted === 'string'
        ? properties.place_formatted
        : '';
    if (!isPlausibleMatch(row, matchedName, matchedAddress)) continue;
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      latitude,
      longitude,
      matchedName,
      matchedAddress,
    };
  }
  return null;
}

async function readBuildings(client: SupabaseClient): Promise<BuildingRow[]> {
  const { data, error } = await client
    .from('campus_destinations')
    .select('id,name,code,latitude,longitude,outdoor_destination_latitude,outdoor_destination_longitude')
    .eq('type', 'building')
    .order('name');
  if (error !== null) throw new Error(`Could not read campus buildings: ${error.message}`);
  return data;
}

async function main(): Promise<void> {
  loadEnvFile({ quiet: true });
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const approved = args.has('--approved');
  const client = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const token = required('MAPBOX_ACCESS_TOKEN');
  const proximity = required('MAPBOX_SEARCH_PROXIMITY');
  const bbox = parseBbox(required('MAPBOX_SEARCH_BBOX'));
  const buildings = (await readBuildings(client)).filter((row) =>
    !completePair(row.latitude, row.longitude) &&
    !completePair(row.outdoor_destination_latitude, row.outdoor_destination_longitude),
  );
  const candidates: Candidate[] = [];
  const unmatched: Array<{ id: string; name: string; code: string | null; reason: string }> = [];

  for (const building of buildings) {
    try {
      const candidate = await findCandidate(building, token, proximity, bbox);
      if (candidate === null) {
        unmatched.push({ id: building.id, name: building.name, code: building.code, reason: 'No in-campus Mapbox result' });
      } else {
        candidates.push(candidate);
      }
    } catch (error) {
      unmatched.push({ id: building.id, name: building.name, code: building.code, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  console.log(JSON.stringify({
    scannedBuildingCount: buildings.length,
    candidateCount: candidates.length,
    unmatchedCount: unmatched.length,
    candidates,
    unmatched,
    bbox,
  }, null, 2));

  if (!apply) return;
  if (!approved) throw new Error('Apply requires --approved');
  for (const candidate of candidates) {
    const { error } = await client
      .from('campus_destinations')
      .update({ latitude: candidate.latitude, longitude: candidate.longitude })
      .eq('id', candidate.id);
    if (error !== null) throw new Error(`Could not update ${candidate.name}: ${error.message}`);
  }
  console.log(JSON.stringify({ updatedCount: candidates.length }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
