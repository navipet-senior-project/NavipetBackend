import { describe, expect, it, vi } from 'vitest';

import { createMapboxSearchGateway } from '../../src/plugins/mapbox-search.js';
import { parseEnv } from '../../src/config/env.js';

const TEST_ENV = parseEnv({
  NODE_ENV: 'test',
  SUPABASE_URL: 'https://project-ref.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_JWT_ISSUER: 'https://project-ref.supabase.co/auth/v1',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
});

describe('Mapbox Search Box gateway', () => {
  it('uses forward search with configured CSULB bias and no persistence', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          attribution: '© Mapbox and its suppliers',
          features: [{
            geometry: { coordinates: [-118.115, 33.782] },
            properties: {
              mapbox_id: 'mapbox.address',
              name: '1250 Bellflower Boulevard',
              place_formatted: 'Long Beach, California 90840',
            },
          }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const gateway = createMapboxSearchGateway(
      {
        ...TEST_ENV,
        MAPBOX_ACCESS_TOKEN: 'pk.test-token',
        MAPBOX_SEARCH_PROXIMITY: '-118.114,33.783',
        MAPBOX_SEARCH_BBOX: '-118.13,33.77,-118.09,33.80',
      },
      fetcher,
    );

    const results = await gateway.searchExternalPlaces('1250 Bellflower', 4);

    const requested = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(requested.pathname).toBe('/search/searchbox/v1/forward');
    expect(requested.searchParams.get('q')).toBe('1250 Bellflower');
    expect(requested.searchParams.get('limit')).toBe('4');
    expect(requested.searchParams.get('proximity')).toBe('-118.114,33.783');
    expect(requested.searchParams.get('bbox')).toBe('-118.13,33.77,-118.09,33.80');
    expect(requested.searchParams.get('country')).toBe('US');
    expect(requested.searchParams.has('permanent')).toBe(false);
    expect(results).toEqual([{
      id: 'mapbox.address',
      name: '1250 Bellflower Boulevard',
      description: 'Long Beach, California 90840',
      latitude: 33.782,
      longitude: -118.115,
      attribution: '© Mapbox and its suppliers',
    }]);
  });

  it('is disabled without complete configuration', async () => {
    const fetcher = vi.fn();
    const gateway = createMapboxSearchGateway(TEST_ENV, fetcher);

    await expect(gateway.searchExternalPlaces('address', 10)).resolves.toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects failed upstream responses', async () => {
    const gateway = createMapboxSearchGateway(
      {
        ...TEST_ENV,
        MAPBOX_ACCESS_TOKEN: 'pk.test-token',
        MAPBOX_SEARCH_PROXIMITY: '-118.114,33.783',
        MAPBOX_SEARCH_BBOX: '-118.13,33.77,-118.09,33.80',
      },
      vi.fn().mockResolvedValue(new Response('denied', { status: 403 })),
    );

    await expect(gateway.searchExternalPlaces('address', 10)).rejects.toThrow(
      'Mapbox Search Box request failed',
    );
  });
});
