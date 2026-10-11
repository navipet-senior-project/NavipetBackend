import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AccessibilityGateway } from '../../src/modules/accessibility/accessibility.types.js';
import type { JwtVerifier } from '../../src/plugins/auth.js';
import { createSupabaseResources } from '../../src/plugins/supabase.js';
import { buildTestApp, TEST_ENV } from '../helpers/build-test-app.js';

const userId = '11111111-1111-4111-8111-111111111111';
const url = '/profiles/me/accessibility';
const authorization = { authorization: 'Bearer valid-access-token' };

const defaults = {
  accessibleRoutes: false,
  avoidStairs: false,
  preferElevators: false,
  avoidSteepSlopes: false,
  voiceGuidance: true,
  hapticTurnAlerts: true,
  highContrastMap: false,
  largerMapLabels: false,
  reduceMotion: false,
  screenReaderDirections: false,
};

const groupedDefaults = {
  accessibility: {
    mobility: {
      accessibleRoutes: false,
      avoidStairs: false,
      preferElevators: false,
      avoidSteepSlopes: false,
    },
    guidance: { voiceGuidance: true, hapticTurnAlerts: true },
    visuals: {
      highContrastMap: false,
      largerMapLabels: false,
      reduceMotion: false,
      screenReaderDirections: false,
    },
  },
};

function verifier(): JwtVerifier {
  return {
    verify: vi.fn().mockResolvedValue({ id: userId, sessionPurpose: 'standard' }),
  };
}

describe('accessibility preferences', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
  });

  async function build(gateway: Partial<AccessibilityGateway>): Promise<FastifyInstance> {
    app = await buildTestApp(
      {},
      {
        authVerifier: verifier(),
        supabaseResources: { ...createSupabaseResources(TEST_ENV), ...gateway },
      },
    );
    return app;
  }

  describe('GET', () => {
    it('returns the defaults when the user has no stored row', async () => {
      const getAccessibilityPreferences = vi.fn().mockResolvedValue(null);
      const instance = await build({ getAccessibilityPreferences });

      const response = await instance.inject({ method: 'GET', url, headers: authorization });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(groupedDefaults);
      expect(getAccessibilityPreferences).toHaveBeenCalledWith('valid-access-token');
    });

    it('returns stored values grouped by section', async () => {
      const instance = await build({
        getAccessibilityPreferences: vi.fn().mockResolvedValue({
          ...defaults,
          avoidStairs: true,
          voiceGuidance: false,
          reduceMotion: true,
        }),
      });

      const response = await instance.inject({ method: 'GET', url, headers: authorization });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        accessibility: {
          mobility: { ...groupedDefaults.accessibility.mobility, avoidStairs: true },
          guidance: { voiceGuidance: false, hapticTurnAlerts: true },
          visuals: { ...groupedDefaults.accessibility.visuals, reduceMotion: true },
        },
      });
    });

    it('returns 401 without a bearer token', async () => {
      const getAccessibilityPreferences = vi.fn();
      const instance = await build({ getAccessibilityPreferences });

      const response = await instance.inject({ method: 'GET', url });

      expect(response.statusCode).toBe(401);
      expect(getAccessibilityPreferences).not.toHaveBeenCalled();
    });

    it('returns 502 without leaking detail when storage fails', async () => {
      const instance = await build({
        getAccessibilityPreferences: vi.fn().mockRejectedValue(new Error('relation missing')),
      });

      const response = await instance.inject({ method: 'GET', url, headers: authorization });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
      expect(response.body).not.toContain('relation missing');
    });
  });

  describe('PATCH', () => {
    it('sends only the supplied field and returns the full preferences', async () => {
      const updateAccessibilityPreferences = vi
        .fn()
        .mockResolvedValue({ ...defaults, avoidStairs: true });
      const instance = await build({ updateAccessibilityPreferences });

      const response = await instance.inject({
        method: 'PATCH',
        url,
        headers: authorization,
        payload: { mobility: { avoidStairs: true } },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        accessibility: {
          ...groupedDefaults.accessibility,
          mobility: { ...groupedDefaults.accessibility.mobility, avoidStairs: true },
        },
      });
      expect(updateAccessibilityPreferences).toHaveBeenCalledWith(
        'valid-access-token',
        userId,
        { avoidStairs: true },
      );
    });

    it('applies fields from several groups in one request', async () => {
      const updateAccessibilityPreferences = vi.fn().mockResolvedValue({
        ...defaults,
        preferElevators: true,
        hapticTurnAlerts: false,
        highContrastMap: true,
      });
      const instance = await build({ updateAccessibilityPreferences });

      const response = await instance.inject({
        method: 'PATCH',
        url,
        headers: authorization,
        payload: {
          mobility: { preferElevators: true },
          guidance: { hapticTurnAlerts: false },
          visuals: { highContrastMap: true },
        },
      });

      expect(response.statusCode).toBe(200);
      expect(updateAccessibilityPreferences).toHaveBeenCalledWith(
        'valid-access-token',
        userId,
        { preferElevators: true, hapticTurnAlerts: false, highContrastMap: true },
      );
    });

    it.each([
      ['an empty object', {}],
      ['an empty group only', { mobility: {} }],
      ['an unknown group', { audio: { loud: true } }],
      ['an unknown field', { mobility: { avoidEscalators: true } }],
      ['a non-boolean value', { mobility: { avoidStairs: 'yes' } }],
      ['a flat field at the root', { avoidStairs: true }],
    ])('returns 422 for %s', async (_label, payload) => {
      const updateAccessibilityPreferences = vi.fn();
      const instance = await build({ updateAccessibilityPreferences });

      const response = await instance.inject({
        method: 'PATCH',
        url,
        headers: authorization,
        payload,
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
      expect(updateAccessibilityPreferences).not.toHaveBeenCalled();
    });

    it('returns 400 for malformed JSON', async () => {
      const instance = await build({ updateAccessibilityPreferences: vi.fn() });

      const response = await instance.inject({
        method: 'PATCH',
        url,
        headers: { ...authorization, 'content-type': 'application/json' },
        payload: '{"mobility":',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'INVALID_JSON' } });
    });

    it('returns 401 without a bearer token', async () => {
      const updateAccessibilityPreferences = vi.fn();
      const instance = await build({ updateAccessibilityPreferences });

      const response = await instance.inject({
        method: 'PATCH',
        url,
        payload: { mobility: { avoidStairs: true } },
      });

      expect(response.statusCode).toBe(401);
      expect(updateAccessibilityPreferences).not.toHaveBeenCalled();
    });

    it('returns 502 without leaking detail when storage fails', async () => {
      const instance = await build({
        updateAccessibilityPreferences: vi.fn().mockRejectedValue(new Error('upsert exploded')),
      });

      const response = await instance.inject({
        method: 'PATCH',
        url,
        headers: authorization,
        payload: { mobility: { avoidStairs: true } },
      });

      expect(response.statusCode).toBe(502);
      expect(response.json()).toMatchObject({ error: { code: 'INTERNAL_ERROR' } });
      expect(response.body).not.toContain('upsert exploded');
    });
  });
});
