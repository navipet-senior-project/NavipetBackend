import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JwtVerifier } from '../../src/plugins/auth.js';
import { createSupabaseResources, type SupabaseResources } from '../../src/plugins/supabase.js';
import type {
  CampusDestinationRecord,
  ExternalPlaceRecord,
  ExternalPlacesGateway,
} from '../../src/modules/campus/campus.types.js';
import type { ClassRecord } from '../../src/modules/classes/classes.types.js';
import { buildTestApp, TEST_ENV } from '../helpers/build-test-app.js';

const anyString = expect.any(String) as unknown;

const verifiedUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'student@example.com',
  sessionPurpose: 'standard' as const,
};

function verifiedVerifier(): JwtVerifier {
  return { verify: vi.fn().mockResolvedValue(verifiedUser) };
}

function building(overrides: Partial<CampusDestinationRecord> = {}): CampusDestinationRecord {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    type: 'building',
    name: 'Vivian Engineering Center',
    code: 'VEC',
    aliases: [],
    parentDestinationId: null,
    buildingCode: 'VEC',
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

function classRecord(overrides: Partial<ClassRecord> = {}): ClassRecord {
  return {
    id: '00000000-0000-4000-8000-0000000000c1',
    courseCode: 'CECS 491A',
    courseName: 'Software Engineering Project',
    building: 'Vivian Engineering Center',
    room: '3-3',
    weekdays: [1, 3, 5],
    startTime: '11:00',
    endTime: '12:15',
    latitude: 33.783,
    longitude: -118.112,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function externalPlace(overrides: Partial<ExternalPlaceRecord> = {}): ExternalPlaceRecord {
  return {
    id: 'mapbox-id-1',
    name: '1250 Bellflower Blvd',
    description: 'Long Beach, CA',
    latitude: 33.784,
    longitude: -118.113,
    ...overrides,
  };
}

function noExternal(): ExternalPlacesGateway {
  return { searchExternalPlaces: vi.fn().mockResolvedValue([]) };
}

function resources(overrides: Partial<SupabaseResources> = {}): SupabaseResources {
  return {
    ...createSupabaseResources(TEST_ENV),
    findBuildingByCode: vi.fn().mockResolvedValue(null),
    searchDestinations: vi.fn().mockResolvedValue([]),
    listClasses: vi.fn().mockResolvedValue([]),
    createClass: vi.fn().mockResolvedValue(classRecord()),
    updateClass: vi.fn().mockResolvedValue(classRecord()),
    deleteClass: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

const createBody = {
  courseCode: 'CECS 491A',
  courseName: 'Software Engineering Project',
  building: 'VEC',
  room: '3-3',
  weekdays: [1, 3, 5],
  startTime: '11:00',
  endTime: '12:15',
};

describe('classes routes', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('rejects every route without a bearer token', async () => {
    app = await buildTestApp({}, { supabaseResources: resources(), externalPlaces: noExternal() });

    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/classes' }),
      app.inject({ method: 'POST', url: '/classes', payload: createBody }),
      app.inject({ method: 'PATCH', url: '/classes/00000000-0000-4000-8000-0000000000c1', payload: { room: '1-1' } }),
      app.inject({ method: 'DELETE', url: '/classes/00000000-0000-4000-8000-0000000000c1' }),
    ]);

    for (const response of responses) expect(response.statusCode).toBe(401);
  });

  it('lists the authenticated user classes', async () => {
    const listClasses = vi.fn().mockResolvedValue([classRecord()]);
    app = await buildTestApp(
      {},
      { supabaseResources: resources({ listClasses }), externalPlaces: noExternal(), authVerifier: verifiedVerifier() },
    );

    const response = await app.inject({
      method: 'GET',
      url: '/classes',
      headers: { authorization: 'Bearer valid-access-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      classes: [{ id: classRecord().id, courseCode: classRecord().courseCode, building: classRecord().building }],
    });
    expect(response.body).not.toContain('"latitude"');
    expect(listClasses).toHaveBeenCalledWith('valid-access-token');
  });

  it('resolves a CSULB building by code and creates the class', async () => {
    const createClass = vi.fn().mockResolvedValue(classRecord());
    const findBuildingByCode = vi.fn().mockResolvedValue(
      building({ latitude: 33.783, longitude: -118.112 }),
    );
    app = await buildTestApp(
      {},
      {
        supabaseResources: resources({ findBuildingByCode, createClass }),
        externalPlaces: noExternal(),
        authVerifier: verifiedVerifier(),
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/classes',
      headers: { authorization: 'Bearer valid-access-token' },
      payload: createBody,
    });

    expect(response.statusCode).toBe(201);
    expect(findBuildingByCode).toHaveBeenCalledWith('VEC');
    expect(createClass).toHaveBeenCalledWith(
      'valid-access-token',
      verifiedUser.id,
      expect.objectContaining({
        building: 'Vivian Engineering Center',
        latitude: 33.783,
        longitude: -118.112,
      }),
    );
  });

  it('derives outdoor coordinates from Mapbox when a matched building has none', async () => {
    const createClass = vi.fn().mockResolvedValue(classRecord());
    const findBuildingByCode = vi.fn().mockResolvedValue(building());
    const searchExternalPlaces = vi.fn().mockResolvedValue([
      externalPlace({ name: 'Vivian Engineering Center', latitude: 33.785, longitude: -118.114 }),
    ]);
    app = await buildTestApp(
      {},
      {
        supabaseResources: resources({ findBuildingByCode, createClass }),
        externalPlaces: { searchExternalPlaces },
        authVerifier: verifiedVerifier(),
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/classes',
      headers: { authorization: 'Bearer valid-access-token' },
      payload: createBody,
    });

    expect(response.statusCode).toBe(201);
    expect(createClass).toHaveBeenCalledWith(
      'valid-access-token',
      verifiedUser.id,
      expect.objectContaining({ latitude: 33.785, longitude: -118.114 }),
    );
  });

  it('falls back to Mapbox forward geocoding for a non-CSULB address', async () => {
    const createClass = vi.fn().mockResolvedValue(classRecord({ building: '1250 Bellflower Blvd' }));
    const searchExternalPlaces = vi.fn().mockResolvedValue([externalPlace()]);
    app = await buildTestApp(
      {},
      {
        supabaseResources: resources({ createClass }),
        externalPlaces: { searchExternalPlaces },
        authVerifier: verifiedVerifier(),
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/classes',
      headers: { authorization: 'Bearer valid-access-token' },
      payload: { ...createBody, building: '1250 Bellflower Blvd, Long Beach, CA' },
    });

    expect(response.statusCode).toBe(201);
    expect(searchExternalPlaces).toHaveBeenCalledWith('1250 Bellflower Blvd, Long Beach, CA', 1);
    expect(createClass).toHaveBeenCalledWith(
      'valid-access-token',
      verifiedUser.id,
      expect.objectContaining({
        building: '1250 Bellflower Blvd',
        latitude: 33.784,
        longitude: -118.113,
      }),
    );
  });

  it('returns 404 when the building is neither a CSULB match nor a geocodable address', async () => {
    app = await buildTestApp(
      {},
      { supabaseResources: resources(), externalPlaces: noExternal(), authVerifier: verifiedVerifier() },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/classes',
      headers: { authorization: 'Bearer valid-access-token' },
      payload: { ...createBody, building: 'zzzzzz-nonexistent' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('returns 502 when a matched CSULB building has no coordinates anywhere', async () => {
    const findBuildingByCode = vi.fn().mockResolvedValue(building());
    app = await buildTestApp(
      {},
      {
        supabaseResources: resources({ findBuildingByCode }),
        externalPlaces: noExternal(),
        authVerifier: verifiedVerifier(),
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/classes',
      headers: { authorization: 'Bearer valid-access-token' },
      payload: createBody,
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
  });

  it.each(['11:00', '10:59'])(
    'returns 422 when endTime (%s) is not later than startTime (11:00)',
    async (endTime) => {
      app = await buildTestApp(
        {},
        { supabaseResources: resources(), externalPlaces: noExternal(), authVerifier: verifiedVerifier() },
      );

      const response = await app.inject({
        method: 'POST',
        url: '/classes',
        headers: { authorization: 'Bearer valid-access-token' },
        payload: { ...createBody, startTime: '11:00', endTime },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    },
  );

  it('updates a class without re-resolving the building when building is omitted', async () => {
    const updateClass = vi.fn().mockResolvedValue(classRecord({ room: '1-1' }));
    const findBuildingByCode = vi.fn();
    app = await buildTestApp(
      {},
      {
        supabaseResources: resources({ updateClass, findBuildingByCode }),
        externalPlaces: noExternal(),
        authVerifier: verifiedVerifier(),
      },
    );

    const response = await app.inject({
      method: 'PATCH',
      url: '/classes/00000000-0000-4000-8000-0000000000c1',
      headers: { authorization: 'Bearer valid-access-token' },
      payload: { room: '1-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(findBuildingByCode).not.toHaveBeenCalled();
    expect(updateClass).toHaveBeenCalledWith(
      'valid-access-token',
      '00000000-0000-4000-8000-0000000000c1',
      { room: '1-1' },
    );
  });

  it('returns 422 for an empty update body', async () => {
    app = await buildTestApp(
      {},
      { supabaseResources: resources(), externalPlaces: noExternal(), authVerifier: verifiedVerifier() },
    );

    const response = await app.inject({
      method: 'PATCH',
      url: '/classes/00000000-0000-4000-8000-0000000000c1',
      headers: { authorization: 'Bearer valid-access-token' },
      payload: {},
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('returns 404 updating a class that does not exist', async () => {
    const updateClass = vi.fn().mockResolvedValue(null);
    app = await buildTestApp(
      {},
      { supabaseResources: resources({ updateClass }), externalPlaces: noExternal(), authVerifier: verifiedVerifier() },
    );

    const response = await app.inject({
      method: 'PATCH',
      url: '/classes/00000000-0000-4000-8000-0000000000c1',
      headers: { authorization: 'Bearer valid-access-token' },
      payload: { room: '1-1' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('deletes a class', async () => {
    const deleteClass = vi.fn().mockResolvedValue(true);
    app = await buildTestApp(
      {},
      { supabaseResources: resources({ deleteClass }), externalPlaces: noExternal(), authVerifier: verifiedVerifier() },
    );

    const response = await app.inject({
      method: 'DELETE',
      url: '/classes/00000000-0000-4000-8000-0000000000c1',
      headers: { authorization: 'Bearer valid-access-token' },
    });

    expect(response.statusCode).toBe(204);
    expect(deleteClass).toHaveBeenCalledWith('valid-access-token', '00000000-0000-4000-8000-0000000000c1');
  });

  it('returns 404 deleting a class that does not exist', async () => {
    const deleteClass = vi.fn().mockResolvedValue(false);
    app = await buildTestApp(
      {},
      { supabaseResources: resources({ deleteClass }), externalPlaces: noExternal(), authVerifier: verifiedVerifier() },
    );

    const response = await app.inject({
      method: 'DELETE',
      url: '/classes/00000000-0000-4000-8000-0000000000c1',
      headers: { authorization: 'Bearer valid-access-token' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('rejects an invalid body', async () => {
    app = await buildTestApp(
      {},
      { supabaseResources: resources(), externalPlaces: noExternal(), authVerifier: verifiedVerifier() },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/classes',
      headers: { authorization: 'Bearer valid-access-token' },
      payload: { ...createBody, weekdays: [8] },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: { code: anyString } });
  });
});
