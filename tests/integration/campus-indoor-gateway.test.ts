import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSupabaseResources } from '../../src/plugins/supabase.js';
import { TEST_ENV } from '../helpers/build-test-app.js';

const env = { ...TEST_ENV, SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key' };
const searchPath = '/rest/v1/rpc/search_campus_destinations';
const refsPath = '/rest/v1/destination_provider_refs';
const doorsPath = '/rest/v1/vec_destination_points';
const vec119Id = '00000000-0000-4000-8000-000000000119';
const cobId = '00000000-0000-4000-8000-000000000001';

function destinationRow(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    type: 'room',
    name: 'VEC 119',
    code: 'VEC-119',
    aliases: [],
    parent_destination_id: null,
    building_code: 'VEC',
    room_number: '119',
    floor_number: '1',
    latitude: null,
    longitude: null,
    outdoor_destination_latitude: null,
    outdoor_destination_longitude: null,
    arrival_radius_meters: null,
    source: 'navipet_vec_rooms',
    metadata: {},
    active: true,
    searchable: true,
    rank: 1,
    ...overrides,
  };
}

const cobRow = destinationRow(cobId, {
  type: 'building',
  name: 'College of Business',
  code: 'COB',
  building_code: 'COB',
  room_number: null,
  floor_number: null,
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function routeFetch(routes: Readonly<Record<string, () => Response>>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const respond = routes[url.pathname];
    return Promise.resolve(
      respond === undefined
        ? jsonResponse({ message: `unexpected request to ${url.pathname}` }, 500)
        : respond(),
    );
  });
}

function requestTo(spy: ReturnType<typeof routeFetch>, pathname: string): URL {
  for (const [input] of spy.mock.calls) {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname === pathname) return url;
  }
  throw new Error(`no request to ${pathname}`);
}

describe('campus indoor references', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('takes a room indoor id from its active door point over a provider ref', async () => {
    const fetchSpy = routeFetch({
      [searchPath]: () => jsonResponse([destinationRow(vec119Id), cobRow]),
      [refsPath]: () =>
        jsonResponse([
          { destination_id: vec119Id, external_id: 'stale-ref' },
          { destination_id: cobId, external_id: 'multiset-cob' },
        ]),
      [doorsPath]: () => jsonResponse([{ destination_id: vec119Id, point_key: 'VEC119' }]),
    });

    const results = await createSupabaseResources(env).searchDestinations('vec 119', 10);

    expect(results.map((place) => [place.id, place.indoorDestinationId])).toEqual([
      [vec119Id, 'VEC119'],
      [cobId, 'multiset-cob'],
    ]);
    const doorQuery = requestTo(fetchSpy, doorsPath).searchParams;
    expect(doorQuery.get('select')).toBe('destination_id,point_key');
    expect(doorQuery.get('active')).toBe('eq.true');
    expect(doorQuery.get('destination_id')).toBe(`in.(${vec119Id},${cobId})`);
  });

  it('leaves a room with no door and no provider ref without an indoor id', async () => {
    routeFetch({
      [searchPath]: () => jsonResponse([destinationRow(vec119Id)]),
      [refsPath]: () => jsonResponse([]),
      [doorsPath]: () => jsonResponse([]),
    });

    const [place] = await createSupabaseResources(env).searchDestinations('vec 119', 10);

    expect(place?.indoorDestinationId).toBeNull();
  });

  it('fails the request when door points cannot be read', async () => {
    routeFetch({
      [searchPath]: () => jsonResponse([destinationRow(vec119Id)]),
      [refsPath]: () => jsonResponse([]),
      [doorsPath]: () =>
        jsonResponse(
          {
            code: 'PGRST205',
            message: "Could not find the table 'public.vec_destination_points' in the schema cache",
          },
          404,
        ),
    });

    await expect(
      createSupabaseResources(env).searchDestinations('vec 119', 10),
    ).rejects.toMatchObject({ code: 'PGRST205' });
  });

  it('skips both lookups when no service role key is configured', async () => {
    const fetchSpy = routeFetch({
      [searchPath]: () => jsonResponse([destinationRow(vec119Id)]),
    });

    const [place] = await createSupabaseResources(TEST_ENV).searchDestinations('vec 119', 10);

    expect(place?.indoorDestinationId).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
