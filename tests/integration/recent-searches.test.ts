import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JwtVerifier } from '../../src/plugins/auth.js';
import { createSupabaseResources } from '../../src/plugins/supabase.js';
import { buildTestApp, TEST_ENV } from '../helpers/build-test-app.js';

const userId = '11111111-1111-4111-8111-111111111111';
const placeId = '00000000-0000-4000-8000-000000000001';
const authorization = { authorization: 'Bearer valid-access-token' };

const destination = {
  id: placeId,
  type: 'building' as const,
  name: 'College of Business',
  code: 'COB',
  aliases: [],
  parentDestinationId: null,
  buildingCode: 'COB',
  roomNumber: null,
  floorNumber: null,
  latitude: 33.783,
  longitude: -118.114,
  outdoorDestinationLatitude: null,
  outdoorDestinationLongitude: null,
  source: 'csulb_building_names_codes',
  active: true,
  searchable: true,
  metadata: {},
  rank: 1,
  indoorDestinationId: null,
};

function verifier(): JwtVerifier {
  return {
    verify: vi.fn().mockResolvedValue({ id: userId, sessionPurpose: 'standard' }),
  };
}

describe('recent searches', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  it('saves a selected place and returns newest searches', async () => {
    const savedPlace = {
      id: placeId,
      type: 'building',
      title: 'College of Business',
      subtitle: 'COB',
      source: 'csulb_building_names_codes',
    };
    const saveRecentSearch = vi.fn().mockResolvedValue(savedPlace);
    const listRecentSearches = vi.fn().mockResolvedValue([
      { place: savedPlace, searchedAt: '2026-09-07T20:00:00.000Z' },
    ]);
    app = await buildTestApp(
      {},
      {
        authVerifier: verifier(),
        supabaseResources: {
          ...createSupabaseResources(TEST_ENV),
          saveRecentSearch,
          listRecentSearches,
          findPlaceById: vi.fn().mockResolvedValue(destination),
        },
      },
    );

    const saved = await app.inject({
      method: 'POST',
      url: '/recent-searches',
      headers: authorization,
      payload: { placeId },
    });
    const listed = await app.inject({
      method: 'GET',
      url: '/recent-searches',
      headers: authorization,
    });

    expect(saved.statusCode).toBe(201);
    expect(saved.json()).toMatchObject({ recentSearch: savedPlace });
    expect(saveRecentSearch).toHaveBeenCalledWith(
      'valid-access-token',
      expect.objectContaining(savedPlace),
    );
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual({
      recentSearches: [{ ...savedPlace, searchedAt: '2026-09-07T20:00:00.000Z' }],
    });
    expect(listRecentSearches).toHaveBeenCalledWith('valid-access-token', 10);
  });

  it.each(['/recent-searches', '/all-recent-searches'])(
    'clears only the authenticated user history through %s',
    async (url) => {
      const clearRecentSearches = vi.fn().mockResolvedValue(undefined);
      app = await buildTestApp(
        {},
        {
          authVerifier: verifier(),
          supabaseResources: {
            ...createSupabaseResources(TEST_ENV),
            clearRecentSearches,
          },
        },
      );

      const response = await app.inject({ method: 'DELETE', url, headers: authorization });

      expect(response.statusCode).toBe(204);
      expect(clearRecentSearches).toHaveBeenCalledWith('valid-access-token');
    },
  );

  it('requires authentication to read recent searches', async () => {
    app = await buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/recent-searches' });

    expect(response.statusCode).toBe(401);
  });

  it('returns 502 when recent search storage is unavailable', async () => {
    app = await buildTestApp(
      {},
      {
        authVerifier: verifier(),
        supabaseResources: {
          ...createSupabaseResources(TEST_ENV),
          listRecentSearches: vi.fn().mockRejectedValue(new Error('database offline')),
        },
      },
    );

    const response = await app.inject({
      method: 'GET',
      url: '/recent-searches',
      headers: authorization,
    });

    expect(response.statusCode).toBe(502);
  });

  it('refreshes the timestamp when saving an already recent place', async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    globalThis.fetch = fetchMock;
    const resources = createSupabaseResources(TEST_ENV);

    try {
      await resources.saveRecentSearch('valid-access-token', {
        id: placeId,
        type: 'building',
        title: 'College of Business',
        subtitle: 'COB',
        source: 'csulb_building_names_codes',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const requestBody: unknown = JSON.parse(request.body as string);
    expect(requestBody).toMatchObject({ place_id: placeId });
    expect(typeof (requestBody as { searched_at?: unknown }).searched_at).toBe('string');
  });
});
