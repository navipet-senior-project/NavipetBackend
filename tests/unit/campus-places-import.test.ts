import { describe, expect, test } from 'vitest';

import {
  assertApplyAuthorized,
  compareCampusPlaces,
  mergeDestination,
  prepareCampusPlaces,
  type ExistingSnapshot,
} from '../../scripts/lib/campus-places-import.js';

const HEADER = [
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
].join(',');

function csvRow(values: readonly string[]): string {
  return values
    .map((value) => `"${value.replaceAll('"', '""')}"`)
    .join(',');
}

function building(overrides: Partial<Record<string, string>> = {}): string {
  const values: Record<string, string> = {
    type: 'building',
    name: '  College   of Business  ',
    code: ' cob ',
    aliases: 'COB Building|Business, College of',
    parent_code: '',
    room_number: '',
    floor_number: '',
    latitude: '',
    longitude: '',
    outdoor_destination_latitude: '',
    outdoor_destination_longitude: '',
    concept3d_id: '',
    concept3d_category_ids: '',
    multiset_destination_id: '',
    source: 'csulb_building_names_codes',
    source_id: 'cob',
    source_url: 'https://www.csulb.edu/maps/building-names-codes',
    searchable: 'true',
    active: 'true',
    metadata: '{"categories":["building"]}',
    ...overrides,
  };

  const columns = HEADER.split(',');
  return csvRow(columns.map((column) => values[column] ?? ''));
}

describe('prepareCampusPlaces', () => {
  test('normalizes canonical fields while preserving the cleaned display name', () => {
    const prepared = prepareCampusPlaces(`${HEADER}\n${building()}\n`);

    expect(prepared.sourceRowCount).toBe(1);
    expect(prepared.rejected).toEqual([]);
    expect(prepared.duplicates).toEqual([]);
    expect(prepared.destinations).toEqual([
      expect.objectContaining({
        import_key: 'source:csulb_building_names_codes:cob',
        type: 'building',
        name: 'College of Business',
        code: 'COB',
        building_code: 'COB',
        source_id: 'cob',
      }),
    ]);
    expect(prepared.aliases.map((alias) => alias.alias)).toEqual([
      'COB Building',
      'Business, College of',
    ]);
  });

  test('normalizes room format and resolves its parent by building code', () => {
    const parent = building();
    const room = building({
      type: 'room',
      name: 'COB 00140',
      code: 'cob-00140',
      aliases: '',
      parent_code: 'cob',
      room_number: ' 00140 ',
      floor_number: '01',
      source: 'authorized_room_export',
      source_id: 'COB-00140',
    });

    const prepared = prepareCampusPlaces(`${HEADER}\n${parent}\n${room}\n`);
    const preparedRoom = prepared.destinations.find((row) => row.type === 'room');

    expect(prepared.missingParents).toEqual([]);
    expect(preparedRoom).toEqual(
      expect.objectContaining({
        code: 'COB-140',
        building_code: 'COB',
        room_number: '140',
        floor_number: '1',
        parent_import_key: 'source:csulb_building_names_codes:cob',
      }),
    );
  });

  test('rejects partial coordinate pairs and reports duplicate conflict keys', () => {
    const invalid = building({ latitude: '33.7' });
    const duplicate = building({ name: 'Different name' });

    const prepared = prepareCampusPlaces(
      `${HEADER}\n${invalid}\n${building()}\n${duplicate}\n`,
    );

    expect(prepared.sourceRowCount).toBe(3);
    expect(prepared.rejected).toHaveLength(1);
    expect(prepared.rejected[0]?.reasons).toContain(
      'latitude and longitude must both be present or both be empty',
    );
    expect(prepared.duplicates).toHaveLength(1);
    expect(prepared.destinations).toHaveLength(1);
  });

  test('counts accepted rows without a code or source id as incomplete', () => {
    const prepared = prepareCampusPlaces(
      `${HEADER}\n${building({ code: '', source_id: '' })}\n`,
    );

    expect(prepared.destinations).toHaveLength(1);
    expect(prepared.incomplete).toHaveLength(1);
    expect(prepared.destinations[0]?.import_key).toBe(
      'canonical:building:college-of-business',
    );
  });
});

describe('compareCampusPlaces', () => {
  test('classifies inserts, updates, unchanged rows, and conflicts', () => {
    const prepared = prepareCampusPlaces(
      `${HEADER}\n${building()}\n${building({
        name: 'Academic Services',
        code: 'as',
        aliases: '',
        source_id: 'AS',
      })}\n`,
    );
    const snapshot: ExistingSnapshot = {
      destinations: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          import_key: 'source:csulb_building_names_codes:cob',
          type: 'building',
          name: 'College of Business',
          code: 'COB',
          parent_destination_id: null,
          building_code: 'COB',
          room_number: null,
          floor_number: null,
          latitude: 33.7,
          longitude: -118.1,
          outdoor_destination_latitude: null,
          outdoor_destination_longitude: null,
          source: 'csulb_building_names_codes',
          source_id: 'cob',
          source_url: 'https://www.csulb.edu/maps/building-names-codes',
          searchable: true,
          active: true,
          metadata: { reviewed: true, categories: ['building'] },
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          import_key: 'unrelated:as',
          type: 'building',
          name: 'Existing AS',
          code: 'AS',
          parent_destination_id: null,
          building_code: 'AS',
          room_number: null,
          floor_number: null,
          latitude: null,
          longitude: null,
          outdoor_destination_latitude: null,
          outdoor_destination_longitude: null,
          source: 'other',
          source_id: 'as',
          source_url: null,
          searchable: true,
          active: true,
          metadata: {},
        },
      ],
      aliases: [],
      providerRefs: [],
    };

    const report = compareCampusPlaces(prepared, snapshot);

    expect(report.proposedInsertCount).toBe(0);
    expect(report.proposedUpdateCount).toBe(0);
    expect(report.unchangedCount).toBe(1);
    expect(report.conflicts).toEqual([
      expect.objectContaining({ code: 'AS', reason: 'normalized code already exists' }),
    ]);
    expect(report).toEqual(
      expect.objectContaining({
        duplicateRows: [],
        incompleteRows: [],
        rejectedRows: [],
        missingParentRecords: [],
      }),
    );
  });
});

describe('mergeDestination', () => {
  test('does not replace reviewed values with empty source values', () => {
    const prepared = prepareCampusPlaces(`${HEADER}\n${building()}\n`);
    const source = prepared.destinations[0];
    if (source === undefined) throw new Error('Expected one prepared destination');
    const existing = {
      ...source,
      id: '11111111-1111-4111-8111-111111111111',
      parent_destination_id: null,
      latitude: 33.7,
      longitude: -118.1,
      metadata: { reviewed: true },
    };

    const merged = mergeDestination(source, existing, null);

    expect(merged.latitude).toBe(33.7);
    expect(merged.longitude).toBe(-118.1);
    expect(merged.metadata).toEqual({ reviewed: true, categories: ['building'] });
  });
});

describe('assertApplyAuthorized', () => {
  test('requires both explicit apply and approval flags', () => {
    expect(() => {
      assertApplyAuthorized(false, false);
    }).toThrow(/--apply/);
    expect(() => {
      assertApplyAuthorized(true, false);
    }).toThrow(/--approved/);
    expect(() => {
      assertApplyAuthorized(true, true);
    }).not.toThrow();
  });
});
