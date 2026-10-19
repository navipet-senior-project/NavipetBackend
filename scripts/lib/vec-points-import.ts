/**
 * Pure logic for importing the VEC door export (contract v2) into
 * public.vec_destination_points. No database or file access here.
 */

export const VEC_POINT_KEY_PATTERN = /^VEC[A-Za-z0-9-]{1,40}$/;
export const PLAUSIBLE_Y_RANGE = { min: -2, max: 25 } as const;

const EXPORT_POINT_TYPES = new Set([
  'door',
  'entrance',
  'elevator',
  'stairs',
  'bathroom',
]);

export interface PreparedDoor {
  point_key: string;
  room_number: string;
  floor: string;
  x: number;
  y: number;
  z: number;
  heading_deg: number | null;
}

export interface PreparedVecExport {
  map_provider: 'multiset';
  map_code: string;
  map_version: number;
  frame: 'multiset-mapset';
  exported_at: string;
  doors: PreparedDoor[];
  skippedNonDoorCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function exportFloors(maps: unknown): Set<string> {
  const floors = new Set<string>();
  if (!Array.isArray(maps)) return floors;
  for (const entry of maps) {
    if (!isRecord(entry) || !Array.isArray(entry.floors)) continue;
    for (const floor of entry.floors) {
      if (typeof floor === 'string') floors.add(floor);
    }
  }
  return floors;
}

export function prepareVecPoints(raw: unknown): PreparedVecExport {
  if (!isRecord(raw)) throw new Error('Export rejected:\n- export must be a JSON object');
  const errors: string[] = [];

  if (raw.schemaVersion !== 2) errors.push('schemaVersion must be 2');
  const map: Record<string, unknown> = isRecord(raw.map) ? raw.map : {};
  if (!isRecord(raw.map)) errors.push('map must be an object');
  if (map.provider !== 'multiset') errors.push("map.provider must be 'multiset'");
  if (map.kind !== 'mapset') errors.push("map.kind must be 'mapset'");
  if (map.frame !== 'multiset-mapset') errors.push("map.frame must be 'multiset-mapset'");
  if (map.buildingCode !== 'VEC') errors.push("map.buildingCode must be 'VEC'");
  const mapCode = typeof map.code === 'string' ? map.code.trim() : '';
  if (mapCode === '') errors.push('map.code is required');
  const mapVersion = map.version;
  const versionIsValid =
    typeof mapVersion === 'number' && Number.isInteger(mapVersion) && mapVersion > 0;
  if (!versionIsValid) errors.push('map.version must be a positive integer');
  const floors = exportFloors(map.maps);
  if (floors.size === 0) errors.push('map.maps must list at least one floor');
  const exportedAt = typeof raw.exportedAt === 'string' ? raw.exportedAt : '';
  if (Number.isNaN(Date.parse(exportedAt))) {
    errors.push('exportedAt must be an ISO timestamp');
  }
  if (!Array.isArray(raw.points)) errors.push('points must be an array');
  const points: unknown[] = Array.isArray(raw.points) ? raw.points : [];

  const doors: PreparedDoor[] = [];
  const keys = new Set<string>();
  let skippedNonDoorCount = 0;
  const { min, max } = PLAUSIBLE_Y_RANGE;

  points.forEach((point, index) => {
    const at = `points[${String(index)}]`;
    if (!isRecord(point)) {
      errors.push(`${at} must be an object`);
      return;
    }
    const key = typeof point.key === 'string' ? point.key : '';
    const label = key === '' ? at : `${at} (${key})`;
    if (!VEC_POINT_KEY_PATTERN.test(key)) {
      errors.push(`${label}: key must match ${VEC_POINT_KEY_PATTERN.source}`);
    } else if (keys.has(key)) {
      errors.push(`${label}: duplicate key`);
    }
    keys.add(key);

    const type = point.type;
    if (typeof type !== 'string' || !EXPORT_POINT_TYPES.has(type)) {
      errors.push(`${label}: unknown type ${JSON.stringify(type)}`);
      return;
    }

    const floor = typeof point.floor === 'string' ? point.floor : '';
    if (!floors.has(floor)) {
      errors.push(`${label}: floor ${JSON.stringify(point.floor)} is not in map.maps floors`);
    }

    const roomNumber =
      typeof point.roomNumber === 'string' && point.roomNumber.trim() !== ''
        ? point.roomNumber.trim()
        : null;
    if (type === 'door' && roomNumber === null) {
      errors.push(`${label}: doors require roomNumber`);
    }
    if (type !== 'door' && point.roomNumber !== null) {
      errors.push(`${label}: roomNumber must be null for ${type}`);
    }

    const position: Record<string, unknown> = isRecord(point.position)
      ? point.position
      : {};
    const { x, y, z } = position;
    const coordinatesAreFinite =
      isFiniteNumber(x) && isFiniteNumber(y) && isFiniteNumber(z);
    if (!coordinatesAreFinite) {
      errors.push(`${label}: position x, y and z must be finite numbers`);
    } else if (y < min || y > max) {
      errors.push(
        `${label}: y=${String(y)} is outside ${String(min)}..${String(max)} m`,
      );
    }

    const heading = point.headingDeg;
    const headingIsValid =
      heading === null || (isFiniteNumber(heading) && heading >= 0 && heading < 360);
    if (!headingIsValid) {
      errors.push(`${label}: headingDeg must be null or in [0, 360)`);
    }

    if (type !== 'door') {
      skippedNonDoorCount += 1;
      return;
    }
    if (coordinatesAreFinite && roomNumber !== null && headingIsValid) {
      doors.push({
        point_key: key,
        room_number: roomNumber,
        floor,
        x,
        y,
        z,
        heading_deg: heading,
      });
    }
  });

  if (errors.length > 0) {
    throw new Error(`Export rejected:\n- ${errors.join('\n- ')}`);
  }

  return {
    map_provider: 'multiset',
    map_code: mapCode,
    map_version: mapVersion as number,
    frame: 'multiset-mapset',
    exported_at: exportedAt,
    doors,
    skippedNonDoorCount,
  };
}

export interface VecRoom {
  id: string;
  room_number: string;
  floor_number: string | null;
}

export interface VecPointRow {
  point_key: string;
  point_type: 'door';
  room_number: string;
  floor: string;
  x: number;
  y: number;
  z: number;
  heading_deg: number | null;
  map_provider: 'multiset';
  map_code: string;
  map_version: number;
  frame: 'multiset-mapset';
  destination_id: string;
  exported_at: string;
  active: boolean;
}

export interface ExistingVecPoint extends VecPointRow {
  id: string;
}

export interface MultisetRef {
  destination_id: string;
  external_id: string;
}

export interface VecSnapshot {
  rooms: VecRoom[];
  points: ExistingVecPoint[];
  multisetRefs: MultisetRef[];
}

export interface VecPointsReport {
  mapCode: string;
  mapVersion: number;
  insert: VecPointRow[];
  update: VecPointRow[];
  unchangedCount: number;
  deactivate: Array<{ id: string; point_key: string; map_version: number }>;
  unmatched: Array<{ point_key: string; room_number: string }>;
  floorMismatches: Array<{
    point_key: string;
    room_number: string;
    exportFloor: string;
    roomFloor: string | null;
  }>;
  skippedNonDoorCount: number;
  danglingRefs: MultisetRef[];
}

function rowsEqual(desired: VecPointRow, current: ExistingVecPoint): boolean {
  return (
    desired.room_number === current.room_number &&
    desired.floor === current.floor &&
    desired.x === current.x &&
    desired.y === current.y &&
    desired.z === current.z &&
    desired.heading_deg === current.heading_deg &&
    desired.destination_id === current.destination_id &&
    Date.parse(desired.exported_at) === Date.parse(current.exported_at) &&
    desired.active === current.active
  );
}

export function compareVecPoints(
  prepared: PreparedVecExport,
  snapshot: VecSnapshot,
): VecPointsReport {
  const roomsByNumber = new Map(snapshot.rooms.map((room) => [room.room_number, room]));
  const currentVersion = new Map(
    snapshot.points
      .filter(
        (point) =>
          point.map_code === prepared.map_code &&
          point.map_version === prepared.map_version,
      )
      .map((point) => [point.point_key, point]),
  );

  const report: VecPointsReport = {
    mapCode: prepared.map_code,
    mapVersion: prepared.map_version,
    insert: [],
    update: [],
    unchangedCount: 0,
    deactivate: [],
    unmatched: [],
    floorMismatches: [],
    skippedNonDoorCount: prepared.skippedNonDoorCount,
    danglingRefs: [],
  };
  const desiredKeys = new Set<string>();

  for (const door of prepared.doors) {
    const room = roomsByNumber.get(door.room_number);
    if (room === undefined) {
      report.unmatched.push({ point_key: door.point_key, room_number: door.room_number });
      continue;
    }
    if (room.floor_number !== door.floor) {
      report.floorMismatches.push({
        point_key: door.point_key,
        room_number: door.room_number,
        exportFloor: door.floor,
        roomFloor: room.floor_number,
      });
      continue;
    }

    const row: VecPointRow = {
      point_key: door.point_key,
      point_type: 'door',
      room_number: door.room_number,
      floor: door.floor,
      x: door.x,
      y: door.y,
      z: door.z,
      heading_deg: door.heading_deg,
      map_provider: prepared.map_provider,
      map_code: prepared.map_code,
      map_version: prepared.map_version,
      frame: prepared.frame,
      destination_id: room.id,
      exported_at: prepared.exported_at,
      active: true,
    };
    desiredKeys.add(door.point_key);

    const current = currentVersion.get(door.point_key);
    if (current === undefined) report.insert.push(row);
    else if (!rowsEqual(row, current)) report.update.push(row);
    else report.unchangedCount += 1;
  }

  for (const point of snapshot.points) {
    if (!point.active || point.map_code !== prepared.map_code) continue;
    const otherVersion = point.map_version !== prepared.map_version;
    if (otherVersion || !desiredKeys.has(point.point_key)) {
      report.deactivate.push({
        id: point.id,
        point_key: point.point_key,
        map_version: point.map_version,
      });
    }
  }

  const roomIds = new Set(snapshot.rooms.map((room) => room.id));
  report.danglingRefs = snapshot.multisetRefs.filter(
    (ref) => roomIds.has(ref.destination_id) && !desiredKeys.has(ref.external_id),
  );

  return report;
}
