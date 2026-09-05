export const DESTINATION_TYPES = [
  'building',
  'room',
  'entrance',
  'parking',
  'dining',
  'service',
  'amenity',
  'transit',
  'landmark',
] as const;

export type DestinationType = (typeof DESTINATION_TYPES)[number];

export interface PreparedDestination {
  import_key: string;
  type: DestinationType;
  name: string;
  code: string | null;
  parent_code: string | null;
  parent_import_key: string | null;
  building_code: string | null;
  room_number: string | null;
  floor_number: string | null;
  latitude: number | null;
  longitude: number | null;
  outdoor_destination_latitude: number | null;
  outdoor_destination_longitude: number | null;
  source: string;
  source_id: string | null;
  source_url: string | null;
  searchable: boolean;
  active: boolean;
  metadata: Record<string, unknown>;
}

export interface ExistingDestination {
  id: string;
  import_key: string;
  type: string;
  name: string;
  code: string | null;
  parent_destination_id: string | null;
  building_code: string | null;
  room_number: string | null;
  floor_number: string | null;
  latitude: number | null;
  longitude: number | null;
  outdoor_destination_latitude: number | null;
  outdoor_destination_longitude: number | null;
  source: string;
  source_id: string | null;
  source_url: string | null;
  searchable: boolean;
  active: boolean;
  metadata: Record<string, unknown>;
}

export interface PreparedAlias {
  destination_import_key: string;
  alias: string;
  source: string;
  source_id: string | null;
  searchable: boolean;
  metadata: Record<string, unknown>;
}

export interface ExistingAlias {
  destination_id: string;
  alias: string;
  normalized_alias: string;
  source: string;
  source_id: string | null;
  searchable: boolean;
  metadata: Record<string, unknown>;
}

export interface PreparedProviderRef {
  destination_import_key: string;
  provider: 'concept3d' | 'multiset';
  scope: string;
  external_id: string;
  external_category_ids: string[];
  source: string;
  source_url: string | null;
  metadata: Record<string, unknown>;
}

export interface ExistingProviderRef {
  destination_id: string;
  provider: string;
  scope: string;
  external_id: string;
  external_category_ids: string[];
  source: string;
  source_url: string | null;
  metadata: Record<string, unknown>;
}

export interface ExistingSnapshot {
  destinations: ExistingDestination[];
  aliases: ExistingAlias[];
  providerRefs: ExistingProviderRef[];
}

export interface RowIssue {
  rowNumber: number;
  importKey: string | null;
  name: string | null;
  reasons: string[];
}

export interface PreparedImport {
  sourceRowCount: number;
  destinations: PreparedDestination[];
  aliases: PreparedAlias[];
  providerRefs: PreparedProviderRef[];
  duplicates: RowIssue[];
  incomplete: RowIssue[];
  rejected: RowIssue[];
  missingParents: RowIssue[];
}

export interface ImportConflict {
  importKey: string;
  name: string;
  code: string | null;
  existingId: string;
  reason: string;
}

export interface DryRunReport {
  sourceRowCount: number;
  proposedInsertCount: number;
  proposedUpdateCount: number;
  unchangedCount: number;
  duplicateCount: number;
  incompleteCount: number;
  rejectedCount: number;
  conflictingRecordCount: number;
  missingParentCount: number;
  aliasInsertCount: number;
  providerRefInsertCount: number;
  upsertConflictKey: 'import_key';
  conflicts: ImportConflict[];
  duplicateRows: RowIssue[];
  incompleteRows: RowIssue[];
  rejectedRows: RowIssue[];
  missingParentRecords: RowIssue[];
}

const REQUIRED_COLUMNS = [
  'type',
  'name',
  'code',
  'aliases',
  'parent_code',
  'room_number',
  'floor_number',
  'latitude',
  'longitude',
  'outdoor_destination_latitude',
  'outdoor_destination_longitude',
  'concept3d_id',
  'concept3d_category_ids',
  'multiset_destination_id',
  'source',
  'source_id',
  'source_url',
  'searchable',
  'active',
  'metadata',
] as const;

type CsvColumn = (typeof REQUIRED_COLUMNS)[number];
type CsvRecord = Record<CsvColumn, string>;

function cleanText(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

function nullableText(value: string): string | null {
  const cleaned = cleanText(value);
  return cleaned === '' ? null : cleaned;
}

function normalizeCode(value: string): string | null {
  const cleaned = nullableText(value);
  return cleaned === null ? null : cleaned.toUpperCase();
}

function normalizeNumberToken(value: string): string | null {
  const cleaned = nullableText(value);
  if (cleaned === null) return null;
  return cleaned.replace(/\d+/gu, (digits) => String(Number(digits)));
}

function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
}

function normalizeAlias(value: string): string {
  return cleanText(value).toLowerCase();
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? '';
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('CSV contains an unterminated quoted field');
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.some((value) => value !== '')) rows.push(row);
  }
  return rows;
}

function parseBoolean(value: string, field: string, reasons: string[]): boolean {
  const normalized = cleanText(value).toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  reasons.push(`${field} must be true or false`);
  return false;
}

function parseCoordinate(
  value: string,
  field: string,
  minimum: number,
  maximum: number,
  reasons: string[],
): number | null {
  const cleaned = nullableText(value);
  if (cleaned === null) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    reasons.push(`${field} must be between ${String(minimum)} and ${String(maximum)}`);
    return null;
  }
  return parsed;
}

function parseMetadata(value: string, reasons: string[]): Record<string, unknown> {
  const cleaned = nullableText(value);
  if (cleaned === null) return {};
  try {
    const parsed: unknown = JSON.parse(cleaned);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      reasons.push('metadata must be a JSON object');
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    reasons.push('metadata must be valid JSON');
    return {};
  }
}

function parseRecords(text: string): CsvRecord[] {
  const rows = parseCsv(text);
  const header = rows.shift();
  if (header === undefined) throw new Error('CSV is empty');
  if (
    header.length !== REQUIRED_COLUMNS.length ||
    !REQUIRED_COLUMNS.every((column, index) => header[index] === column)
  ) {
    throw new Error(`CSV header must be: ${REQUIRED_COLUMNS.join(',')}`);
  }

  return rows.map((values, rowIndex) => {
    if (values.length !== REQUIRED_COLUMNS.length) {
      throw new Error(
        `CSV row ${String(rowIndex + 2)} has ${String(values.length)} columns; expected ${String(REQUIRED_COLUMNS.length)}`,
      );
    }
    return Object.fromEntries(
      REQUIRED_COLUMNS.map((column, index) => [column, values[index] ?? '']),
    ) as CsvRecord;
  });
}

function destinationImportKey(
  type: DestinationType,
  name: string,
  source: string,
  sourceId: string | null,
): string {
  if (sourceId !== null) return `source:${source.toLowerCase()}:${sourceId.toLowerCase()}`;
  return `canonical:${type}:${slug(name)}`;
}

function sourceRecordKey(source: string, sourceId: string | null): string | null {
  return sourceId === null
    ? null
    : `${cleanText(source).toLowerCase()}:${cleanText(sourceId)}`;
}

function comparableDestination(value: ExistingDestination): Record<string, unknown> {
  return {
    import_key: value.import_key,
    type: value.type,
    name: value.name,
    code: value.code,
    parent_destination_id: value.parent_destination_id,
    building_code: value.building_code,
    room_number: value.room_number,
    floor_number: value.floor_number,
    latitude: value.latitude,
    longitude: value.longitude,
    outdoor_destination_latitude: value.outdoor_destination_latitude,
    outdoor_destination_longitude: value.outdoor_destination_longitude,
    source: value.source,
    source_id: value.source_id,
    source_url: value.source_url,
    searchable: value.searchable,
    active: value.active,
    metadata: value.metadata,
  };
}

export function assertApplyAuthorized(apply: boolean, approved: boolean): void {
  if (!apply) throw new Error('Database writes require the --apply flag');
  if (!approved) throw new Error('Database writes require the --approved flag');
}

export function destinationsEqual(
  left: ExistingDestination | Omit<ExistingDestination, 'id'>,
  right: ExistingDestination,
): boolean {
  return (
    JSON.stringify(comparableDestination(left as ExistingDestination)) ===
    JSON.stringify(comparableDestination(right))
  );
}

export function prepareCampusPlaces(csvText: string): PreparedImport {
  const records = parseRecords(csvText);
  const destinations: PreparedDestination[] = [];
  const aliases: PreparedAlias[] = [];
  const providerRefs: PreparedProviderRef[] = [];
  const duplicates: RowIssue[] = [];
  const incomplete: RowIssue[] = [];
  const rejected: RowIssue[] = [];
  const missingParents: RowIssue[] = [];
  const importKeys = new Set<string>();

  for (const [index, record] of records.entries()) {
    const rowNumber = index + 2;
    const reasons: string[] = [];
    const typeValue = cleanText(record.type).toLowerCase();
    const type = DESTINATION_TYPES.find((candidate) => candidate === typeValue);
    const name = cleanText(record.name);
    const source = cleanText(record.source);
    const sourceId = nullableText(record.source_id);

    if (type === undefined) reasons.push('type is not recognized');
    if (name === '' || name.length > 200) reasons.push('name must contain 1 to 200 characters');
    if (source === '') reasons.push('source is required');

    const latitude = parseCoordinate(record.latitude, 'latitude', -90, 90, reasons);
    const longitude = parseCoordinate(record.longitude, 'longitude', -180, 180, reasons);
    if ((latitude === null) !== (longitude === null)) {
      reasons.push('latitude and longitude must both be present or both be empty');
    }
    const outdoorLatitude = parseCoordinate(
      record.outdoor_destination_latitude,
      'outdoor_destination_latitude',
      -90,
      90,
      reasons,
    );
    const outdoorLongitude = parseCoordinate(
      record.outdoor_destination_longitude,
      'outdoor_destination_longitude',
      -180,
      180,
      reasons,
    );
    if ((outdoorLatitude === null) !== (outdoorLongitude === null)) {
      reasons.push(
        'outdoor destination latitude and longitude must both be present or both be empty',
      );
    }

    const metadata = parseMetadata(record.metadata, reasons);
    const searchable = parseBoolean(record.searchable, 'searchable', reasons);
    const active = parseBoolean(record.active, 'active', reasons);
    const code = normalizeCode(record.code);
    const parentCode = normalizeCode(record.parent_code);
    const roomNumber = normalizeNumberToken(record.room_number);
    const floorNumber = normalizeNumberToken(record.floor_number);

    if (type === 'room' && roomNumber === null) reasons.push('room_number is required for rooms');
    if (type === 'room' && parentCode === null) reasons.push('parent_code is required for rooms');

    const importKey =
      type === undefined || name === '' || source === ''
        ? null
        : destinationImportKey(type, name, source, sourceId);
    const issue = { rowNumber, importKey, name: name === '' ? null : name, reasons };
    if (reasons.length > 0 || importKey === null || type === undefined) {
      rejected.push(issue);
      continue;
    }
    if (importKeys.has(importKey)) {
      duplicates.push({ ...issue, reasons: ['duplicate import_key in source'] });
      continue;
    }
    importKeys.add(importKey);

    const normalizedRoomCode =
      type === 'room' && parentCode !== null && roomNumber !== null
        ? `${parentCode}-${roomNumber}`
        : code;
    const destination: PreparedDestination = {
      import_key: importKey,
      type,
      name,
      code: normalizedRoomCode,
      parent_code: parentCode,
      parent_import_key: null,
      building_code: type === 'room' ? parentCode : normalizedRoomCode,
      room_number: roomNumber,
      floor_number: floorNumber,
      latitude,
      longitude,
      outdoor_destination_latitude: outdoorLatitude,
      outdoor_destination_longitude: outdoorLongitude,
      source,
      source_id: sourceId,
      source_url: nullableText(record.source_url),
      searchable,
      active,
      metadata,
    };
    destinations.push(destination);

    for (const aliasValue of record.aliases.split('|')) {
      const alias = cleanText(aliasValue);
      if (alias === '' || normalizeAlias(alias) === normalizeAlias(name)) continue;
      aliases.push({
        destination_import_key: importKey,
        alias,
        source,
        source_id: sourceId,
        searchable,
        metadata: {},
      });
    }

    const concept3dId = nullableText(record.concept3d_id);
    if (concept3dId !== null) {
      providerRefs.push({
        destination_import_key: importKey,
        provider: 'concept3d',
        scope: 'map:1314',
        external_id: concept3dId,
        external_category_ids: record.concept3d_category_ids
          .split('|')
          .map(cleanText)
          .filter((value) => value !== ''),
        source,
        source_url: nullableText(record.source_url),
        metadata: {},
      });
    }
    const multisetId = nullableText(record.multiset_destination_id);
    if (multisetId !== null) {
      providerRefs.push({
        destination_import_key: importKey,
        provider: 'multiset',
        scope: '',
        external_id: multisetId,
        external_category_ids: [],
        source,
        source_url: nullableText(record.source_url),
        metadata: {},
      });
    }

    if (code === null || sourceId === null) {
      incomplete.push({
        ...issue,
        reasons: [
          ...(code === null ? ['code is unavailable'] : []),
          ...(sourceId === null ? ['source_id is unavailable'] : []),
        ],
      });
    }
  }

  const buildingByCode = new Map(
    destinations.flatMap((destination) =>
      destination.type === 'building' && destination.code !== null
        ? [[destination.code, destination] as const]
        : [],
    ),
  );
  for (const destination of destinations) {
    if (destination.parent_code === null) continue;
    const parent = buildingByCode.get(destination.parent_code);
    if (parent === undefined) {
      missingParents.push({
        rowNumber: records.findIndex((record) => cleanText(record.name) === destination.name) + 2,
        importKey: destination.import_key,
        name: destination.name,
        reasons: [`parent building ${destination.parent_code} is missing`],
      });
    } else {
      destination.parent_import_key = parent.import_key;
    }
  }

  return {
    sourceRowCount: records.length,
    destinations,
    aliases,
    providerRefs,
    duplicates,
    incomplete,
    rejected,
    missingParents,
  };
}

export function mergeDestination(
  source: PreparedDestination,
  existing: ExistingDestination | undefined,
  parentDestinationId: string | null,
): ExistingDestination | Omit<ExistingDestination, 'id'> {
  const keep = <T>(incoming: T | null, current: T | null | undefined): T | null =>
    incoming ?? current ?? null;
  const sourceMetadata = source.metadata;
  const existingMetadata = existing?.metadata ?? {};
  return {
    ...(existing === undefined ? {} : { id: existing.id }),
    import_key: source.import_key,
    type: source.type,
    name: source.name,
    code: keep(source.code, existing?.code),
    parent_destination_id: parentDestinationId ?? existing?.parent_destination_id ?? null,
    building_code: keep(source.building_code, existing?.building_code),
    room_number: keep(source.room_number, existing?.room_number),
    floor_number: keep(source.floor_number, existing?.floor_number),
    latitude: keep(source.latitude, existing?.latitude),
    longitude: keep(source.longitude, existing?.longitude),
    outdoor_destination_latitude: keep(
      source.outdoor_destination_latitude,
      existing?.outdoor_destination_latitude,
    ),
    outdoor_destination_longitude: keep(
      source.outdoor_destination_longitude,
      existing?.outdoor_destination_longitude,
    ),
    source: source.source,
    source_id: keep(source.source_id, existing?.source_id),
    source_url: keep(source.source_url, existing?.source_url),
    searchable: source.searchable,
    active: source.active,
    metadata: { ...existingMetadata, ...sourceMetadata },
  };
}

export function compareCampusPlaces(
  prepared: PreparedImport,
  snapshot: ExistingSnapshot,
): DryRunReport {
  const byImportKey = new Map(
    snapshot.destinations.map((destination) => [destination.import_key, destination]),
  );
  const byCode = new Map(
    snapshot.destinations.flatMap((destination) => {
      const code = normalizeCode(destination.code ?? '');
      return code === null ? [] : [[code, destination] as const];
    }),
  );
  const bySource = new Map(
    snapshot.destinations
      .map((destination) => [
        sourceRecordKey(destination.source, destination.source_id),
        destination,
      ] as const)
      .filter((entry): entry is [string, ExistingDestination] => entry[0] !== null),
  );
  const preparedIds = new Map(
    prepared.destinations.flatMap((destination) => {
      const existing = byImportKey.get(destination.import_key);
      return existing === undefined ? [] : [[destination.import_key, existing.id] as const];
    }),
  );

  let proposedInsertCount = 0;
  let proposedUpdateCount = 0;
  let unchangedCount = 0;
  const conflicts: ImportConflict[] = [];

  for (const source of prepared.destinations) {
    const existing = byImportKey.get(source.import_key);
    const codeConflict = source.code === null ? undefined : byCode.get(source.code);
    const sourceConflict = bySource.get(sourceRecordKey(source.source, source.source_id) ?? '');
    const conflicting =
      codeConflict !== undefined && codeConflict.import_key !== source.import_key
        ? { destination: codeConflict, reason: 'normalized code already exists' }
        : sourceConflict !== undefined && sourceConflict.import_key !== source.import_key
          ? { destination: sourceConflict, reason: 'source and source_id already exist' }
          : undefined;
    if (conflicting !== undefined) {
      conflicts.push({
        importKey: source.import_key,
        name: source.name,
        code: source.code,
        existingId: conflicting.destination.id,
        reason: conflicting.reason,
      });
      continue;
    }

    const parentId =
      source.parent_import_key === null
        ? null
        : (preparedIds.get(source.parent_import_key) ?? null);
    if (existing === undefined) {
      proposedInsertCount += 1;
      continue;
    }
    const merged = mergeDestination(source, existing, parentId);
    if (destinationsEqual(merged, existing)) {
      unchangedCount += 1;
    } else {
      proposedUpdateCount += 1;
    }
  }

  const existingAliasKeys = new Set(
    snapshot.aliases.map(
      (alias) => `${alias.destination_id}:${normalizeAlias(alias.normalized_alias)}`,
    ),
  );
  const aliasInsertCount = prepared.aliases.filter((alias) => {
    const destinationId = preparedIds.get(alias.destination_import_key);
    return (
      destinationId === undefined ||
      !existingAliasKeys.has(`${destinationId}:${normalizeAlias(alias.alias)}`)
    );
  }).length;
  const existingProviderKeys = new Set(
    snapshot.providerRefs.map(
      (reference) =>
        `${reference.provider}:${reference.scope}:${reference.external_id}`,
    ),
  );
  const providerRefInsertCount = prepared.providerRefs.filter(
    (reference) =>
      !existingProviderKeys.has(
        `${reference.provider}:${reference.scope}:${reference.external_id}`,
      ),
  ).length;

  return {
    sourceRowCount: prepared.sourceRowCount,
    proposedInsertCount,
    proposedUpdateCount,
    unchangedCount,
    duplicateCount: prepared.duplicates.length,
    incompleteCount: prepared.incomplete.length,
    rejectedCount: prepared.rejected.length,
    conflictingRecordCount: conflicts.length,
    missingParentCount: prepared.missingParents.length,
    aliasInsertCount,
    providerRefInsertCount,
    upsertConflictKey: 'import_key',
    conflicts,
    duplicateRows: prepared.duplicates,
    incompleteRows: prepared.incomplete,
    rejectedRows: prepared.rejected,
    missingParentRecords: prepared.missingParents,
  };
}
