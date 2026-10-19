import { describe, expect, test } from 'vitest';

import { prepareVecPoints } from '../../scripts/lib/vec-points-import.js';

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
