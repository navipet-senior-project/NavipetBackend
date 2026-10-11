import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSupabaseResources } from '../../src/plugins/supabase.js';
import { TEST_ENV } from '../helpers/build-test-app.js';

const userId = '11111111-1111-4111-8111-111111111111';

const storedRow = {
  accessible_routes: false,
  avoid_stairs: true,
  prefer_elevators: false,
  avoid_steep_slopes: false,
  voice_guidance: true,
  haptic_turn_alerts: true,
  high_contrast_map: false,
  larger_map_labels: false,
  reduce_motion: false,
  screen_reader_directions: false,
};

const storedPreferences = {
  accessibleRoutes: false,
  avoidStairs: true,
  preferElevators: false,
  avoidSteepSlopes: false,
  voiceGuidance: true,
  hapticTurnAlerts: true,
  highContrastMap: false,
  largerMapLabels: false,
  reduceMotion: false,
  screenReaderDirections: false,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(response: Response) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
}

function sentRequest(spy: ReturnType<typeof stubFetch>): {
  url: URL;
  method: string;
  body: unknown;
} {
  const call = spy.mock.calls[0];
  if (call === undefined) throw new Error('fetch was not called');
  const [input, init] = call;
  const url = new URL(input instanceof Request ? input.url : input.toString());
  const rawBody = init?.body;
  return {
    url,
    method: init?.method ?? 'GET',
    body: typeof rawBody === 'string' ? (JSON.parse(rawBody) as unknown) : undefined,
  };
}

describe('accessibility gateway', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when the user has no stored row', async () => {
    const fetchSpy = stubFetch(jsonResponse([]));

    await expect(
      createSupabaseResources(TEST_ENV).getAccessibilityPreferences('access-token'),
    ).resolves.toBeNull();

    const request = sentRequest(fetchSpy);
    expect(request.method).toBe('GET');
    expect(request.url.pathname).toBe('/rest/v1/accessibility_preferences');
    expect(request.url.searchParams.get('select')).toBe(Object.keys(storedRow).join(','));
  });

  it('maps the stored row to preferences', async () => {
    stubFetch(jsonResponse([storedRow]));

    await expect(
      createSupabaseResources(TEST_ENV).getAccessibilityPreferences('access-token'),
    ).resolves.toEqual(storedPreferences);
  });

  it('throws when the read fails', async () => {
    stubFetch(jsonResponse({ message: 'permission denied', code: '42501' }, 403));

    await expect(
      createSupabaseResources(TEST_ENV).getAccessibilityPreferences('access-token'),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('upserts only the supplied columns for the user', async () => {
    const fetchSpy = stubFetch(jsonResponse([storedRow], 201));

    await expect(
      createSupabaseResources(TEST_ENV).updateAccessibilityPreferences(
        'access-token',
        userId,
        { avoidStairs: true },
      ),
    ).resolves.toEqual(storedPreferences);

    const request = sentRequest(fetchSpy);
    expect(request.method).toBe('POST');
    expect(request.url.pathname).toBe('/rest/v1/accessibility_preferences');
    expect(request.url.searchParams.get('on_conflict')).toBe('user_id');
    expect(request.body).toEqual({ user_id: userId, avoid_stairs: true });
  });

  it('throws when the upsert fails', async () => {
    stubFetch(jsonResponse({ message: 'permission denied', code: '42501' }, 403));

    await expect(
      createSupabaseResources(TEST_ENV).updateAccessibilityPreferences(
        'access-token',
        userId,
        { avoidStairs: true },
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('throws when the upsert returns no row', async () => {
    stubFetch(jsonResponse([], 201));

    await expect(
      createSupabaseResources(TEST_ENV).updateAccessibilityPreferences(
        'access-token',
        userId,
        { avoidStairs: true },
      ),
    ).rejects.toThrow('Accessibility preference upsert returned no row.');
  });
});
