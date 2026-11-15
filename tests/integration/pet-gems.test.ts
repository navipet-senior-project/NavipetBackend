import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseResources } from '../../src/plugins/supabase.js';
import { buildTestApp, TEST_ENV } from '../helpers/build-test-app.js';

const headers = { authorization: 'Bearer token' };
let app: FastifyInstance | undefined;
afterEach(async () => { await app?.close(); });

async function setup(result: unknown) {
  const rpc = vi.fn().mockResolvedValue({ data: result, error: null });
  const forAccessToken = vi.fn().mockReturnValue({ rpc });
  app = await buildTestApp({}, {
    authVerifier: { verify: () => Promise.resolve({ id: '11111111-1111-4111-8111-111111111111', sessionPurpose: 'standard' as const }) },
    supabaseResources: { ...createSupabaseResources(TEST_ENV), forAccessToken },
  });
  return { app, rpc, forAccessToken };
}

describe('pet gems', () => {
  it('requires authentication', async () => {
    const { app } = await setup(null);
    expect((await app.inject({ method: 'GET', url: '/pet/gems' })).statusCode).toBe(401);
  });
  it('returns the current wallet and costumes through the user token', async () => {
    const state = { balance: 12, equippedOutfit: 'hat', ownedOutfits: ['hat'] };
    const { app, rpc, forAccessToken } = await setup(state);
    const response = await app.inject({ method: 'GET', url: '/pet/gems', headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(state);
    expect(forAccessToken).toHaveBeenCalledWith('token');
    expect(rpc).toHaveBeenCalledWith('get_pet_gems', undefined);
  });
  it('returns the catalogue', async () => {
    const { app } = await setup([{ id: 'hat', name: 'Hat', price: 10, assetReference: 'hat.png', owned: false }]);
    const response = await app.inject({ method: 'GET', url: '/pet/costumes', headers });
    expect(response.json()).toEqual({ costumes: [{ id: 'hat', name: 'Hat', price: 10, assetReference: 'hat.png', owned: false }] });
  });
  it('buys and equips with one RPC and rejects client prices', async () => {
    const { app, rpc } = await setup({ status: 'ok', balance: 10, equippedOutfit: 'hat' });
    const response = await app.inject({ method: 'POST', url: '/pet/costumes/buy', headers, payload: { outfitId: 'hat', equip: true } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ balance: 10, equippedOutfit: 'hat' });
    expect(rpc).toHaveBeenCalledWith('purchase_pet_costume', { p_outfit_id: 'hat', p_equip: true });
    expect((await app.inject({ method: 'POST', url: '/pet/costumes/buy', headers, payload: { outfitId: 'hat', price: 1 } })).statusCode).toBe(422);
  });
  it('reports the exact shortfall', async () => {
    const { app } = await setup({ status: 'insufficient', shortfall: 7 });
    const response = await app.inject({ method: 'POST', url: '/pet/costumes/buy', headers, payload: { outfitId: 'hat' } });
    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: unknown }>().error).toMatchObject({ code: 'INSUFFICIENT_GEMS', shortfall: 7 });
  });
  it('equips an owned outfit and reports missing items', async () => {
    const { app, rpc } = await setup({ status: 'ok', balance: 10, equippedOutfit: 'hat' });
    const response = await app.inject({ method: 'POST', url: '/pet/costumes/equip', headers, payload: { outfitId: 'hat' } });
    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith('equip_pet_costume', { p_outfit_id: 'hat' });
  });
});
