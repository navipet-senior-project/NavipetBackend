import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Writable } from 'node:stream';

import { buildApp } from '../../src/app.js';
import type {
  CampusDestinationRecord,
  ExternalPlacesGateway,
} from '../../src/modules/campus/campus.types.js';
import {
  createSupabaseResources,
  type SupabaseResources,
} from '../../src/plugins/supabase.js';
import { buildTestApp, TEST_ENV } from '../helpers/build-test-app.js';

const ids = {
  cob: '00000000-0000-4000-8000-000000000001',
  hsci: '00000000-0000-4000-8000-000000000002',
  room: '00000000-0000-4000-8000-000000000003',
};

function destination(
  overrides: Partial<CampusDestinationRecord> = {},
): CampusDestinationRecord {
  return {
    id: ids.cob,
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
    rank: 1,
    indoorDestinationId: null,
    ...overrides,
  };
}

const searchable = [
  destination(),
  destination({ id: ids.hsci, name: 'Hall of Science', code: 'HSCI', buildingCode: 'HSCI' }),
  destination({ name: 'Library', code: 'LIB', buildingCode: 'LIB', aliases: [] }),
  destination({ type: 'parking', name: 'General Parking Lot G1', code: 'G1', buildingCode: 'G1', aliases: [], metadata: { categories: ['parking_lot'], parking_class: 'student_general' } }),
  destination({ type: 'parking', name: 'Pyramid Parking Structure', code: null, buildingCode: null, aliases: [], metadata: { categories: ['parking_structure'] } }),
  destination({ name: 'Bookstore', code: 'BKS', buildingCode: 'BKS', aliases: [], metadata: { categories: ['student_services'] } }),
  destination({ name: 'Student Health Services', code: 'SHS', buildingCode: 'SHS', aliases: [], metadata: { categories: ['student_services'] } }),
  destination({ type: 'landmark', name: 'Earl Burns Miller Japanese Garden', code: 'JG', buildingCode: 'JG', aliases: ['Japanese Garden'], metadata: { categories: ['campus_landmark'] } }),
  destination({ name: 'LBS Financial Credit Union Pyramid', code: 'PYR', buildingCode: 'PYR', aliases: [], metadata: { categories: ['athletic_facility', 'campus_landmark'] } }),
  destination({ name: 'E. James Brotman Hall', code: 'BH', buildingCode: 'BH', aliases: ['Brotman Hall'], metadata: { categories: ['building'] } }),
  destination({ name: 'Parkside North', code: 'PSN', buildingCode: 'PSN', aliases: [], metadata: { categories: ['housing'] } }),
  destination({ type: 'landmark', name: 'Softball Field', code: null, buildingCode: null, aliases: [], metadata: { categories: ['athletic_facility'] } }),
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim();
}

function resources(
  overrides: Partial<SupabaseResources> = {},
): SupabaseResources {
  return {
    ...createSupabaseResources(TEST_ENV),
    searchDestinations: vi.fn((query: string) => {
      const needle = normalize(query);
      return Promise.resolve(
        searchable.filter((record) =>
          [record.code ?? '', record.name, ...record.aliases]
            .map(normalize)
            .some((value) => value.includes(needle) || needle.includes(value)),
        ),
      );
    }),
    searchCategoryDestinations: vi.fn().mockResolvedValue([]),
    listProximityDestinations: vi.fn().mockResolvedValue([]),
    findPlaceById: vi.fn((id: string) =>
      Promise.resolve(searchable.find((record) => record.id === id) ?? null),
    ),
    findBuildingByCode: vi.fn((code: string) =>
      Promise.resolve(
        searchable.find(
          (record) => record.type === 'building' && record.code === code,
        ) ?? null,
      ),
    ),
    searchBuildingRooms: vi.fn().mockResolvedValue([]),
    searchBuildingChildren: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function noExternal(): ExternalPlacesGateway {
  return { searchExternalPlaces: vi.fn().mockResolvedValue([]) };
}

describe('campus routes', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it.each([
    ['COB', 'College of Business'],
    ['cob', 'College of Business'],
    ['College of Business', 'College of Business'],
    ['HSCI', 'Hall of Science'],
    ['Hall of Science', 'Hall of Science'],
    ['library', 'Library'],
    ['parking G1', 'General Parking Lot G1'],
    ['G1', 'General Parking Lot G1'],
    ['Pyramid parking', 'Pyramid Parking Structure'],
    ['bookstore', 'Bookstore'],
    ['student health', 'Student Health Services'],
    ['Japanese Garden', 'Earl Burns Miller Japanese Garden'],
    ['Walter Pyramid', 'LBS Financial Credit Union Pyramid'],
    ['financial aid', 'E. James Brotman Hall'],
    ['Parkside North', 'Parkside North'],
    ['softball field', 'Softball Field'],
    ['Colle', 'College of Business'],
    ['libary', 'Library'],
  ])('returns the intended local result for %s', async (query, title) => {
    const local = resources({
      searchDestinations: vi
        .fn()
        .mockResolvedValue(searchable.filter((record) => record.name === title)),
    });
    app = await buildTestApp({}, { supabaseResources: local, externalPlaces: noExternal() });

    const response = await app.inject({
      method: 'GET',
      url: `/autocomplete?q=${encodeURIComponent(query)}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      query,
      results: [{ title, source: expect.any(String) as unknown }],
    });
  });

  it.each(['COB 140', 'COB-140', 'COB140', 'College of Business 140', 'room 140 COB'])(
    'returns a building alternative for nonexistent room query %s',
    async (query) => {
      app = await buildTestApp({}, { supabaseResources: resources(), externalPlaces: noExternal() });

      const response = await app.inject({
        method: 'GET',
        url: `/autocomplete?q=${encodeURIComponent(query)}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        query,
        results: [
          {
            id: ids.cob,
            type: 'building',
            title: 'College of Business',
            subtitle: 'Building-level alternative · COB',
          },
        ],
      });
    },
  );

  it('returns an empty list for no local or external result', async () => {
    app = await buildTestApp({}, { supabaseResources: resources({ searchDestinations: vi.fn().mockResolvedValue([]) }), externalPlaces: noExternal() });

    const response = await app.inject({ method: 'GET', url: '/autocomplete?q=zzzzzz' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ query: 'zzzzzz', results: [] });
  });

  it.each(['/autocomplete', '/autocomplete?q=', '/autocomplete?q=x', '/autocomplete?q=---'])(
    'rejects an empty or one-character query: %s',
    async (url) => {
      app = await buildTestApp({}, { supabaseResources: resources(), externalPlaces: noExternal() });
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    },
  );

  it('rejects an excessive limit', async () => {
    app = await buildTestApp({}, { supabaseResources: resources(), externalPlaces: noExternal() });
    const response = await app.inject({ method: 'GET', url: '/autocomplete?q=COB&limit=21' });
    expect(response.statusCode).toBe(422);
  });

  it('omits inactive and non-searchable records defensively', async () => {
    const hidden = [
      destination({ active: false, name: 'Inactive Hall', code: 'INACTIVE' }),
      destination({ searchable: false, name: 'Hidden Hall', code: 'HIDDEN' }),
    ];
    app = await buildTestApp({}, {
      supabaseResources: resources({ searchDestinations: vi.fn().mockResolvedValue(hidden) }),
      externalPlaces: noExternal(),
    });

    const response = await app.inject({ method: 'GET', url: '/autocomplete?q=hall' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ query: 'hall', results: [] });
  });

  it('returns one active searchable place without internal database fields', async () => {
    app = await buildTestApp({}, { supabaseResources: resources(), externalPlaces: noExternal() });

    const response = await app.inject({ method: 'GET', url: `/places/${ids.cob}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      place: {
        id: ids.cob,
        type: 'building',
        title: 'College of Business',
        subtitle: 'COB',
        buildingCode: 'COB',
        source: 'csulb_building_names_codes',
      },
    });
  });

  it('returns 404 for an unknown place', async () => {
    app = await buildTestApp({}, { supabaseResources: resources(), externalPlaces: noExternal() });
    const response = await app.inject({ method: 'GET', url: '/places/00000000-0000-4000-8000-000000000099' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('returns only verified room children for a building', async () => {
    const room = destination({
      id: ids.room,
      type: 'room',
      name: 'COB 140',
      code: 'COB-140',
      aliases: [],
      parentDestinationId: ids.cob,
      parentName: 'College of Business',
      roomNumber: '140',
      floorNumber: '1',
    });
    app = await buildTestApp({}, {
      supabaseResources: resources({ searchBuildingRooms: vi.fn().mockResolvedValue([room]) }),
      externalPlaces: noExternal(),
    });

    const response = await app.inject({ method: 'GET', url: '/buildings/cob/rooms?q=140' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      building: { id: ids.cob, code: 'COB', name: 'College of Business' },
      query: '140',
      results: [{
        id: ids.room,
        type: 'room',
        title: 'COB 140',
        subtitle: 'College of Business · Floor 1',
        buildingCode: 'COB',
        roomNumber: '140',
        floorNumber: '1',
        source: 'csulb_building_names_codes',
      }],
    });
  });

  it('uses Mapbox only after local search returns no results', async () => {
    const externalPlaces: ExternalPlacesGateway = {
      searchExternalPlaces: vi.fn().mockResolvedValue([{
        id: 'mapbox.address',
        name: '1250 Bellflower Boulevard',
        description: 'Long Beach, California 90840',
        latitude: 33.782,
        longitude: -118.115,
      }]),
    };
    app = await buildTestApp({}, {
      supabaseResources: resources({ searchDestinations: vi.fn().mockResolvedValue([]) }),
      externalPlaces,
    });

    const response = await app.inject({ method: 'GET', url: '/autocomplete?q=1250%20Bellflower' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      results: [{ source: 'mapbox', external: true }],
    });
  });

  it('supports verified building-contained amenities through parent relationships', async () => {
    const elevator = destination({
      id: '00000000-0000-4000-8000-000000000010',
      type: 'amenity',
      name: 'COB Elevator',
      code: null,
      aliases: [],
      parentDestinationId: ids.cob,
      metadata: { categories: ['elevator'] },
    });
    app = await buildTestApp({}, {
      supabaseResources: resources({
        searchBuildingChildren: vi.fn().mockResolvedValue([elevator]),
      }),
      externalPlaces: noExternal(),
    });

    const response = await app.inject({ method: 'GET', url: '/autocomplete?q=elevator%20in%20COB' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ results: [{ id: elevator.id, title: 'COB Elevator' }] });
  });

  it('returns a structured error when proximity intent lacks user location', async () => {
    app = await buildTestApp({}, {
      supabaseResources: resources(),
      externalPlaces: noExternal(),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/autocomplete?q=nearest%20restroom',
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      error: {
        code: 'LOCATION_REQUIRED',
        message: 'Latitude and longitude are required for proximity search.',
        requestId: expect.any(String) as unknown,
      },
    });
  });

  it.each([
    '/autocomplete?q=nearest%20parking&latitude=91&longitude=-118.1141',
    '/autocomplete?q=nearest%20parking&latitude=33.7838&longitude=-181',
    '/autocomplete?q=nearest%20parking&latitude=33.7838',
  ])('rejects invalid or incomplete coordinates: %s', async (url) => {
    app = await buildTestApp({}, {
      supabaseResources: resources(),
      externalPlaces: noExternal(),
    });

    const response = await app.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('returns verified nearby results in distance order with proximity metadata', async () => {
    const far = destination({
      id: '00000000-0000-4000-8000-000000000031',
      type: 'parking',
      name: 'Parking Structure 2',
      code: 'PS2',
      buildingCode: null,
      latitude: 33.7856,
      longitude: -118.1141,
      metadata: { categories: ['parking_structure'] },
    });
    const near = destination({
      id: '00000000-0000-4000-8000-000000000032',
      type: 'parking',
      name: 'Parking Lot G1',
      code: 'G1',
      buildingCode: null,
      latitude: 33.78425,
      longitude: -118.1141,
      metadata: { categories: ['parking_lot'] },
    });
    app = await buildTestApp({}, {
      supabaseResources: resources({
        listProximityDestinations: vi.fn().mockResolvedValue([far, near]),
      }),
      externalPlaces: noExternal(),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/autocomplete?q=nearest%20parking&latitude=33.7838&longitude=-118.1141&limit=10',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      query: 'nearest parking',
      proximity: { intent: 'parking', status: 'ok', radiusMeters: 2000 },
      results: [
        { id: near.id, distanceMeters: 50 },
        { id: far.id, distanceMeters: 200 },
      ],
    });
  });

  it('returns no nearby results without calling Mapbox', async () => {
    const external = { searchExternalPlaces: vi.fn().mockResolvedValue([]) };
    app = await buildTestApp({}, {
      supabaseResources: resources({
        listProximityDestinations: vi.fn().mockResolvedValue([]),
      }),
      externalPlaces: external,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/autocomplete?q=coffee%20near%20me&latitude=33.7838&longitude=-118.1141',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      proximity: { intent: 'coffee', status: 'ok' },
      results: [],
    });
    expect(external.searchExternalPlaces).not.toHaveBeenCalled();
  });

  it('redacts precise coordinates from autocomplete request logs', async () => {
    let output = '';
    const stream = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    app = await buildApp({
      env: TEST_ENV,
      logger: { level: 'info', stream },
      supabaseResources: resources(),
      externalPlaces: noExternal(),
    });

    await app.inject({
      method: 'GET',
      url: '/autocomplete?q=nearest%20parking&latitude=33.7838&longitude=-118.1141',
    });
    await app.inject({
      method: 'GET',
      url: '/autocomplete?q=nearest%20parking&lat%69tude=33.7838&long%69tude=-118.1141',
    });

    expect(output).not.toContain('33.7838');
    expect(output).not.toContain('-118.1141');
    expect(output).toContain('[REDACTED]');
  });
});
