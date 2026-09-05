import { describe, expect, it, vi } from 'vitest';

import {
  attachIndoorDestinationIds,
  createCampusService,
  normalizeCampusQuery,
} from '../../src/modules/campus/campus.service.js';
import type {
  CampusDestinationRecord,
  CampusPlacesGateway,
  ExternalPlacesGateway,
} from '../../src/modules/campus/campus.types.js';

function destination(
  overrides: Partial<CampusDestinationRecord> = {},
): CampusDestinationRecord {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    type: 'building',
    name: 'College of Business',
    code: 'COB',
    aliases: ['Business Building'],
    parentDestinationId: null,
    buildingCode: 'COB',
    roomNumber: null,
    floorNumber: null,
    latitude: null,
    longitude: null,
    outdoorDestinationLatitude: null,
    outdoorDestinationLongitude: null,
    source: 'csulb_building_names_codes',
    active: true,
    searchable: true,
    metadata: { categories: ['building'] },
    rank: 0.5,
    indoorDestinationId: null,
    ...overrides,
  };
}

function gateways(records: CampusDestinationRecord[]): {
  campusPlaces: CampusPlacesGateway;
  externalPlaces: ExternalPlacesGateway;
} {
  return {
    campusPlaces: {
      searchDestinations: vi.fn().mockResolvedValue(records),
      searchCategoryDestinations: vi.fn().mockResolvedValue(records),
      findPlaceById: vi.fn().mockResolvedValue(null),
      findBuildingByCode: vi.fn().mockResolvedValue(null),
      searchBuildingRooms: vi.fn().mockResolvedValue([]),
      searchBuildingChildren: vi.fn().mockResolvedValue([]),
    },
    externalPlaces: {
      searchExternalPlaces: vi.fn().mockResolvedValue([]),
    },
  };
}

describe('normalizeCampusQuery', () => {
  it.each([
    ['COB 140', 'cob', '140'],
    ['cob 140', 'cob', '140'],
    ['COB-140', 'cob', '140'],
    ['COB140', 'cob', '140'],
    ['COB, Room 140', 'cob', '140'],
    ['College of Business 140', 'college of business', '140'],
    ['room 140 COB', 'cob', '140'],
  ])('recognizes %s as the same building-room intent', (query, building, room) => {
    expect(normalizeCampusQuery(query)).toMatchObject({
      normalized: `${building} ${room}`,
      roomIntent: { buildingQuery: building, roomNumber: room },
    });
  });

  it('normalizes punctuation and repeated whitespace for ordinary searches', () => {
    expect(normalizeCampusQuery('  Hall,   of Science!! ')).toEqual({
      display: 'Hall, of Science!!',
      normalized: 'hall of science',
      meaningfulLength: 13,
      roomIntent: null,
    });
  });
});

describe('campus autocomplete service', () => {
  it('attaches only verified Multiset destination references', () => {
    const cob = destination();
    const hsci = destination({ id: '00000000-0000-4000-8000-000000000002' });

    const enriched = attachIndoorDestinationIds([cob, hsci], [
      { destinationId: cob.id, externalId: 'multiset-cob' },
    ]);

    expect(enriched[0]?.indoorDestinationId).toBe('multiset-cob');
    expect(enriched[1]?.indoorDestinationId).toBeNull();
  });

  it('ranks exact code above exact name, alias, prefix, fuzzy, and category', async () => {
    const exactCode = destination();
    const exactName = destination({
      id: '00000000-0000-4000-8000-000000000002',
      code: 'BUS',
      name: 'COB',
      buildingCode: 'BUS',
    });
    const exactAlias = destination({
      id: '00000000-0000-4000-8000-000000000003',
      code: 'CBA',
      name: 'Business Administration',
      aliases: ['COB'],
      buildingCode: 'CBA',
    });
    const prefix = destination({
      id: '00000000-0000-4000-8000-000000000004',
      code: 'COBALT',
      name: 'Cobalt Hall',
      aliases: [],
      buildingCode: 'COBALT',
    });
    const fuzzy = destination({
      id: '00000000-0000-4000-8000-000000000005',
      code: 'LIB',
      name: 'Cobble Hall',
      aliases: [],
      buildingCode: 'LIB',
    });
    const category = destination({
      id: '00000000-0000-4000-8000-000000000006',
      code: 'P1',
      name: 'Parking Lot One',
      aliases: [],
      buildingCode: 'P1',
      metadata: { categories: ['cob'] },
    });
    const deps = gateways([
      category,
      fuzzy,
      prefix,
      exactAlias,
      exactName,
      exactCode,
    ]);

    const result = await createCampusService(deps).autocomplete('COB', 10);

    expect(result.results.map((item) => item.id)).toEqual([
      exactCode.id,
      exactName.id,
      exactAlias.id,
      prefix.id,
      fuzzy.id,
      category.id,
    ]);
  });

  it('uses controlled fuzzy matching for a common misspelling', async () => {
    const library = destination({
      code: 'LIB',
      name: 'Library',
      aliases: [],
      buildingCode: 'LIB',
    });
    const deps = gateways([library]);

    const result = await createCampusService(deps).autocomplete('libary', 10);

    expect(result.results[0]).toMatchObject({ title: 'Library', buildingCode: 'LIB' });
  });

  it.each([
    ['Walter Pyramid', 'PYR', 'LBS Financial Credit Union Pyramid'],
    ['financial aid', 'BH', 'E. James Brotman Hall'],
  ])('resolves verified service/legacy intent %s to building code %s', async (query, code, name) => {
    const target = destination({ code, name, buildingCode: code, aliases: [] });
    const deps = gateways([]);
    deps.campusPlaces.searchDestinations = vi.fn().mockResolvedValue([
      destination({ type: 'parking', name: 'Unrelated fuzzy result', code: null }),
    ]);
    deps.campusPlaces.findBuildingByCode = vi.fn().mockResolvedValue(target);

    const result = await createCampusService(deps).autocomplete(query, 10);

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({ title: name, buildingCode: code });
  });

  it('matches a category only from controlled metadata', async () => {
    const verified = destination({
      id: '00000000-0000-4000-8000-000000000007',
      type: 'parking',
      name: 'Visitor Parking Lot',
      code: 'V1',
      buildingCode: 'V1',
      metadata: { categories: ['parking_lot'], parking_class: 'visitor' },
    });
    const incidental = destination({
      id: '00000000-0000-4000-8000-000000000008',
      name: 'Visitor Parking Administration',
      code: 'VPA',
      buildingCode: 'VPA',
      metadata: { categories: ['building'], description: 'Visitor parking office' },
    });
    const deps = gateways([incidental, verified]);

    const result = await createCampusService(deps).autocomplete('visitor parking', 10);

    expect(result.results.map((item) => item.id)).toEqual([verified.id]);
  });

  it('returns a building alternative without inventing a nonexistent room', async () => {
    const building = destination();
    const deps = gateways([building]);
    deps.campusPlaces.searchBuildingRooms = vi.fn().mockResolvedValue([]);

    const result = await createCampusService(deps).autocomplete('COB-140', 10);

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      id: building.id,
      type: 'building',
      title: 'College of Business',
      subtitle: 'Building-level alternative · COB',
    });
    expect(result.results[0]).not.toHaveProperty('roomNumber');
  });

  it('ranks the exact building-room code before room prefixes', async () => {
    const building = destination();
    const exact = destination({
      id: '00000000-0000-4000-8000-000000000011',
      type: 'room',
      name: 'COB 140',
      code: 'COB-140',
      aliases: [],
      parentDestinationId: building.id,
      roomNumber: '140',
    });
    const prefix = destination({
      id: '00000000-0000-4000-8000-000000000012',
      type: 'room',
      name: 'COB 140A',
      code: 'COB-140A',
      aliases: [],
      parentDestinationId: building.id,
      roomNumber: '140A',
    });
    const deps = gateways([building]);
    deps.campusPlaces.searchBuildingRooms = vi
      .fn()
      .mockResolvedValue([prefix, exact]);

    const result = await createCampusService(deps).autocomplete('COB140', 10);

    expect(result.results.map((item) => item.id)).toEqual([exact.id, prefix.id]);
  });

  it.each([
    ['elevator in COB', 'elevator'],
    ['accessible entrance COB', 'accessible_entrance'],
    ['restroom in HSCI', 'restroom'],
  ])('returns only verified building-contained results for %s', async (query, category) => {
    const building = destination({
      code: query.includes('HSCI') ? 'HSCI' : 'COB',
      name: query.includes('HSCI') ? 'Hall of Science' : 'College of Business',
      buildingCode: query.includes('HSCI') ? 'HSCI' : 'COB',
    });
    const child = destination({
      id: '00000000-0000-4000-8000-000000000009',
      type: category === 'accessible_entrance' ? 'entrance' : 'amenity',
      name: category === 'restroom' ? 'First-floor Restroom' : 'Accessible Elevator',
      code: null,
      aliases: [],
      parentDestinationId: building.id,
      buildingCode: building.code,
      metadata: {
        categories: [category],
        ...(category === 'accessible_entrance' ? { accessible: true } : {}),
      },
    });
    const deps = gateways([building]);
    deps.campusPlaces.searchBuildingChildren = vi.fn().mockResolvedValue([child]);

    const result = await createCampusService(deps).autocomplete(query, 10);

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({ id: child.id, buildingCode: building.code });
  });

  it('does not call external fallback when local results exist or for room intents', async () => {
    const localDeps = gateways([destination()]);
    const localExternalSearch = vi.fn().mockResolvedValue([]);
    localDeps.externalPlaces.searchExternalPlaces = localExternalSearch;
    await createCampusService(localDeps).autocomplete('COB', 10);
    expect(localExternalSearch).not.toHaveBeenCalled();

    const roomDeps = gateways([]);
    const roomExternalSearch = vi.fn().mockResolvedValue([]);
    roomDeps.externalPlaces.searchExternalPlaces = roomExternalSearch;
    await createCampusService(roomDeps).autocomplete('COB 999', 10);
    expect(roomExternalSearch).not.toHaveBeenCalled();
  });

  it('labels external fallback and exposes only valid coordinates', async () => {
    const deps = gateways([]);
    deps.externalPlaces.searchExternalPlaces = vi.fn().mockResolvedValue([
      {
        id: 'mapbox.abc',
        name: '1250 Bellflower Boulevard',
        description: 'Long Beach, California 90840',
        latitude: 33.782,
        longitude: -118.115,
        attribution: '© Mapbox and its suppliers',
      },
    ]);

    const result = await createCampusService(deps).autocomplete(
      '1250 Bellflower Boulevard',
      10,
    );

    expect(result.results).toEqual([
      {
        id: 'mapbox:mapbox.abc',
        type: 'external',
        title: '1250 Bellflower Boulevard',
        subtitle: 'Long Beach, California 90840',
        source: 'mapbox',
        external: true,
        attribution: '© Mapbox and its suppliers',
        navigation: {
          outdoorDestination: { latitude: 33.782, longitude: -118.115 },
        },
      },
    ]);
  });
});
