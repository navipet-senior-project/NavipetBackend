import { describe, expect, test } from 'vitest';

import {
  compareVecPoints,
  prepareVecPoints,
  type ExistingVecPoint,
  type VecPointRow,
  type VecSnapshot,
} from '../../scripts/lib/vec-points-import.js';

function door(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key: 'VEC119',
    type: 'door',
    roomNumber: '119',
    floor: '1',
    position: { x: 1.5, y: 0.4, z: -3.25 },
    headingDeg: 270,
    ...overrides,
  };
}

function stairs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key: 'VECstairsF1A',
    type: 'stairs',
    roomNumber: null,
    floor: '1',
    position: { x: 4, y: 0.4, z: 2 },
    headingDeg: null,
    ...overrides,
  };
}

function vecExport(
  overrides: Record<string, unknown> = {},
  mapOverrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: 2,
    map: {
      provider: 'multiset',
      kind: 'mapset',
      code: 'MSET_XTBY7AM7ZK77',
      version: 1,
      buildingCode: 'VEC',
      maps: [{ code: 'MAP_YXEW0CKO9CX8', floors: ['1', '2'] }],
      frame: 'multiset-mapset',
      handedness: 'left',
      up: '+Y',
      units: 'm',
      ...mapOverrides,
    },
    exportedAt: '2026-10-19T00:00:00Z',
    unityVersion: '6000.3.11f1',
    points: [door()],
    ...overrides,
  };
}

describe('prepareVecPoints', () => {
  test('prepares a valid door', () => {
    expect(prepareVecPoints(vecExport())).toEqual({
      map_provider: 'multiset',
      map_code: 'MSET_XTBY7AM7ZK77',
      map_version: 1,
      frame: 'multiset-mapset',
      exported_at: '2026-10-19T00:00:00Z',
      doors: [
        {
          point_key: 'VEC119',
          room_number: '119',
          floor: '1',
          x: 1.5,
          y: 0.4,
          z: -3.25,
          heading_deg: 270,
        },
      ],
      skippedNonDoorCount: 0,
    });
  });

  test('skips and counts non-door points', () => {
    const prepared = prepareVecPoints(vecExport({ points: [door(), stairs()] }));
    expect(prepared.doors.map((entry) => entry.point_key)).toEqual(['VEC119']);
    expect(prepared.skippedNonDoorCount).toBe(1);
  });

  test('accepts a null heading', () => {
    const prepared = prepareVecPoints(
      vecExport({ points: [door({ headingDeg: null })] }),
    );
    expect(prepared.doors[0]?.heading_deg).toBeNull();
  });

  test.each([
    ['schemaVersion 1', vecExport({ schemaVersion: 1 }), /schemaVersion must be 2/],
    [
      'v1 frame',
      vecExport({}, { frame: 'unity-mapspace-local' }),
      /map\.frame must be 'multiset-mapset'/,
    ],
    ['another building', vecExport({}, { buildingCode: 'COB' }), /map\.buildingCode/],
    ['version 0', vecExport({}, { version: 0 }), /map\.version must be a positive integer/],
    ['blank key', vecExport({ points: [door({ key: '' })] }), /key must match/],
    ['malformed key', vecExport({ points: [door({ key: 'VEC 119' })] }), /key must match/],
    [
      'duplicate key',
      vecExport({ points: [door(), door({ roomNumber: '120' })] }),
      /duplicate key/,
    ],
    [
      'door without roomNumber',
      vecExport({ points: [door({ roomNumber: null })] }),
      /doors require roomNumber/,
    ],
    [
      'non-door with roomNumber',
      vecExport({ points: [stairs({ roomNumber: '119' })] }),
      /roomNumber must be null/,
    ],
    ['unknown type', vecExport({ points: [door({ type: 'window' })] }), /unknown type/],
    [
      'v1 floor format',
      vecExport({ points: [door({ floor: 'floor_1' })] }),
      /is not in map\.maps floors/,
    ],
    [
      'floor outside the maps',
      vecExport({ points: [door({ floor: '3' })] }),
      /is not in map\.maps floors/,
    ],
    [
      'string coordinate',
      vecExport({ points: [door({ position: { x: '1', y: 0.4, z: 0 } })] }),
      /must be finite numbers/,
    ],
    [
      'infinite coordinate',
      vecExport({ points: [door({ position: { x: Infinity, y: 0.4, z: 0 } })] }),
      /must be finite numbers/,
    ],
    [
      'centimetres instead of metres',
      vecExport({ points: [door({ position: { x: 1, y: 45, z: 0 } })] }),
      /outside -2\.\.25 m/,
    ],
    [
      'heading 360',
      vecExport({ points: [door({ headingDeg: 360 })] }),
      /headingDeg must be null or in \[0, 360\)/,
    ],
    [
      'missing heading',
      vecExport({ points: [door({ headingDeg: undefined })] }),
      /headingDeg must be null or in \[0, 360\)/,
    ],
    ['bad timestamp', vecExport({ exportedAt: 'yesterday' }), /exportedAt/],
  ])('rejects %s', (_label, input, message) => {
    expect(() => prepareVecPoints(input)).toThrow(message);
  });

  test('reports every problem at once', () => {
    const input = vecExport(
      { points: [door({ key: '' }), door({ key: 'VEC120', floor: '7' })] },
      { frame: 'unity-mapspace-local' },
    );
    expect(() => prepareVecPoints(input)).toThrow(
      /map\.frame[\s\S]*key must match[\s\S]*is not in map\.maps floors/,
    );
  });
});

const rooms = [
  { id: 'room-119', room_number: '119', floor_number: '1' },
  { id: 'room-201', room_number: '201', floor_number: '2' },
];

function twoDoors(mapOverrides: Record<string, unknown> = {}) {
  return prepareVecPoints(
    vecExport(
      { points: [door(), door({ key: 'VEC201', roomNumber: '201', floor: '2' })] },
      mapOverrides,
    ),
  );
}

function only<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('missing fixture row');
  return value;
}

function snapshot(overrides: Partial<VecSnapshot> = {}): VecSnapshot {
  return { rooms, points: [], multisetRefs: [], ...overrides };
}

function stored(row: VecPointRow, overrides: Partial<ExistingVecPoint> = {}): ExistingVecPoint {
  return { ...row, id: `id-${row.point_key}-${String(row.map_version)}`, ...overrides };
}

describe('compareVecPoints', () => {
  test('inserts new doors linked to their rooms', () => {
    const report = compareVecPoints(twoDoors(), snapshot());
    expect(report.insert).toEqual([
      {
        point_key: 'VEC119',
        point_type: 'door',
        room_number: '119',
        floor: '1',
        x: 1.5,
        y: 0.4,
        z: -3.25,
        heading_deg: 270,
        map_provider: 'multiset',
        map_code: 'MSET_XTBY7AM7ZK77',
        map_version: 1,
        frame: 'multiset-mapset',
        destination_id: 'room-119',
        exported_at: '2026-10-19T00:00:00Z',
        active: true,
      },
      expect.objectContaining({ point_key: 'VEC201', destination_id: 'room-201' }),
    ]);
    expect(report.update).toEqual([]);
    expect(report.deactivate).toEqual([]);
  });

  test('a second run after apply changes nothing', () => {
    const first = compareVecPoints(twoDoors(), snapshot());
    const second = compareVecPoints(
      twoDoors(),
      snapshot({ points: first.insert.map((row) => stored(row)) }),
    );
    expect(second.insert).toEqual([]);
    expect(second.update).toEqual([]);
    expect(second.deactivate).toEqual([]);
    expect(second.unchangedCount).toBe(2);
  });

  test('treats the same instant in another timestamp format as unchanged', () => {
    const first = compareVecPoints(twoDoors(), snapshot());
    const points = first.insert.map((row) =>
      stored(row, { exported_at: '2026-10-19T00:00:00+00:00' }),
    );
    expect(compareVecPoints(twoDoors(), snapshot({ points })).unchangedCount).toBe(2);
  });

  test('updates a door whose position changed', () => {
    const first = compareVecPoints(twoDoors(), snapshot());
    const points = first.insert.map((row) =>
      row.point_key === 'VEC119' ? stored(row, { x: 9 }) : stored(row),
    );
    const report = compareVecPoints(twoDoors(), snapshot({ points }));
    expect(report.update.map((row) => [row.point_key, row.x])).toEqual([['VEC119', 1.5]]);
    expect(report.unchangedCount).toBe(1);
  });

  test('reactivates a door that was deactivated earlier', () => {
    const first = compareVecPoints(twoDoors(), snapshot());
    const points = first.insert.map((row) =>
      row.point_key === 'VEC119' ? stored(row, { active: false }) : stored(row),
    );
    const report = compareVecPoints(twoDoors(), snapshot({ points }));
    expect(report.update.map((row) => [row.point_key, row.active])).toEqual([
      ['VEC119', true],
    ]);
  });

  test('deactivates an active key that is missing from the file', () => {
    const first = compareVecPoints(twoDoors(), snapshot());
    const gone = stored({ ...only(first.insert[0]), point_key: 'VEC999', room_number: '999' });
    const report = compareVecPoints(
      twoDoors(),
      snapshot({ points: [...first.insert.map((row) => stored(row)), gone] }),
    );
    expect(report.deactivate).toEqual([
      { id: gone.id, point_key: 'VEC999', map_version: 1 },
    ]);
  });

  test('a version bump inserts the new version and deactivates the old one', () => {
    const v1 = compareVecPoints(twoDoors(), snapshot()).insert.map((row) => stored(row));
    const report = compareVecPoints(twoDoors({ version: 2 }), snapshot({ points: v1 }));
    expect(report.insert.map((row) => [row.point_key, row.map_version])).toEqual([
      ['VEC119', 2],
      ['VEC201', 2],
    ]);
    expect(report.deactivate.map((row) => [row.point_key, row.map_version])).toEqual([
      ['VEC119', 1],
      ['VEC201', 1],
    ]);
  });

  test('does not deactivate rows that are already inactive', () => {
    const v1 = compareVecPoints(twoDoors(), snapshot()).insert.map((row) =>
      stored(row, { active: false }),
    );
    expect(
      compareVecPoints(twoDoors({ version: 2 }), snapshot({ points: v1 })).deactivate,
    ).toEqual([]);
  });

  test('reports a door with no room as unmatched and does not insert it', () => {
    const report = compareVecPoints(
      twoDoors(),
      snapshot({ rooms: rooms.filter((room) => room.id === 'room-119') }),
    );
    expect(report.unmatched).toEqual([{ point_key: 'VEC201', room_number: '201' }]);
    expect(report.insert.map((row) => row.point_key)).toEqual(['VEC119']);
  });

  test('reports a floor mismatch and does not insert the door', () => {
    const report = compareVecPoints(
      twoDoors(),
      snapshot({
        rooms: [only(rooms[0]), { id: 'room-201', room_number: '201', floor_number: '3' }],
      }),
    );
    expect(report.floorMismatches).toEqual([
      { point_key: 'VEC201', room_number: '201', exportFloor: '2', roomFloor: '3' },
    ]);
    expect(report.insert.map((row) => row.point_key)).toEqual(['VEC119']);
  });

  test('warns about a room provider ref whose key has no door', () => {
    const report = compareVecPoints(
      twoDoors(),
      snapshot({
        multisetRefs: [
          { destination_id: 'room-119', external_id: 'VEC119' },
          { destination_id: 'room-201', external_id: 'VEC-201' },
          { destination_id: 'not-vec', external_id: 'SOMETHING' },
        ],
      }),
    );
    expect(report.danglingRefs).toEqual([
      { destination_id: 'room-201', external_id: 'VEC-201' },
    ]);
  });

  test('carries the skipped non-door count', () => {
    const prepared = prepareVecPoints(vecExport({ points: [door(), stairs()] }));
    expect(compareVecPoints(prepared, snapshot()).skippedNonDoorCount).toBe(1);
  });
});
