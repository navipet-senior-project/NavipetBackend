import type { FastifyPluginCallbackTypebox } from '@fastify/type-provider-typebox';
import Type from 'typebox';

import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { ErrorResponseSchema } from '../../common/errors/error-response.schema.js';

const outfit = Type.Object(
  { outfitId: Type.String({ minLength: 1, maxLength: 200 }) },
  { additionalProperties: false },
);
const purchase = Type.Object(
  { ...outfit.properties, equip: Type.Optional(Type.Boolean()) },
  { additionalProperties: false },
);
const wallet = Type.Object({
  balance: Type.Integer(),
  equippedOutfit: Type.Union([Type.String(), Type.Null()]),
});
const errors = {
  401: ErrorResponseSchema('Authentication required'),
  422: ErrorResponseSchema('Invalid input'),
  502: ErrorResponseSchema('Storage unavailable'),
};
const schema = (summary: string) => ({
  tags: ['Pet gems'], summary, security: [{ bearerAuth: [] }], response: errors,
});
const response = {
  ...errors,
  200: wallet,
  404: ErrorResponseSchema('Costume not found or not owned'),
  409: Type.Object({ error: Type.Object({
    code: Type.String(), message: Type.String(), requestId: Type.String(), shortfall: Type.Integer(),
  }) }),
};

type Costume = { id: string; name: string; price: number; assetReference: string; owned: boolean };
type PurchaseResult = { status: string; shortfall?: number; balance: number; equippedOutfit: string | null };

const petGemsRoutes: FastifyPluginCallbackTypebox = (fastify, _options, done) => {
  async function rpc<T>(token: string, name: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await fastify.supabase.forAccessToken(token).rpc(name, args) as {
      data: unknown; error: unknown;
    };
    if (error) throw new AppError({
      code: ErrorCode.UPSTREAM_ERROR, statusCode: 502, message: 'Pet gems storage unavailable', cause: error,
    });
    return data as T;
  }

  fastify.get('/pet/gems', {
    preHandler: fastify.authenticate,
    schema: {
      ...schema('Get gem balance and owned outfits'),
      response: { ...errors, 200: Type.Object({ ...wallet.properties, ownedOutfits: Type.Array(Type.String()) }) },
    },
  }, async request => rpc(request.accessToken as string, 'get_pet_gems'));

  fastify.get('/pet/costumes', {
    preHandler: fastify.authenticate,
    schema: {
      ...schema('List pet costumes'),
      response: { ...errors, 200: Type.Object({ costumes: Type.Array(Type.Object({
        id: Type.String(), name: Type.String(), price: Type.Integer(), assetReference: Type.String(), owned: Type.Boolean(),
      })) }) },
    },
  }, async request => ({ costumes: await rpc<Costume[]>(request.accessToken as string, 'get_pet_costumes') }));

  function outcome(result: PurchaseResult) {
    if (result.status === 'not_found') throw new AppError({
      code: ErrorCode.NOT_FOUND, statusCode: 404, message: 'Costume not found or not owned',
    });
    if (result.status === 'insufficient') throw new AppError({
      code: ErrorCode.INSUFFICIENT_GEMS, statusCode: 409, message: 'Not enough gems',
      details: { shortfall: result.shortfall },
    });
    if (result.status !== 'ok') throw new AppError({
      code: ErrorCode.UPSTREAM_ERROR, statusCode: 502, message: 'Pet gems storage unavailable',
    });
    return { balance: result.balance, equippedOutfit: result.equippedOutfit };
  }

  fastify.post('/pet/costumes/buy', {
    preHandler: fastify.authenticate,
    schema: { ...schema('Buy and optionally equip a costume'), body: purchase, response },
  }, async request => outcome(await rpc<PurchaseResult>(request.accessToken as string, 'purchase_pet_costume', {
    p_outfit_id: request.body.outfitId, p_equip: request.body.equip ?? false,
  })));

  fastify.post('/pet/costumes/equip', {
    preHandler: fastify.authenticate,
    schema: { ...schema('Equip an owned costume'), body: outfit, response },
  }, async request => outcome(await rpc<PurchaseResult>(request.accessToken as string, 'equip_pet_costume', {
    p_outfit_id: request.body.outfitId,
  })));

  fastify.post('/pet/rewards/daily-login', {
    preHandler: fastify.authenticate,
    schema: {
      ...schema('Claim the daily login reward'),
      response: { ...errors, 200: Type.Object({ balance: Type.Integer(), earned: Type.Integer() }) },
    },
  }, async request => {
    const result = await rpc<{ status: string; balance: number; earned: number }>(
      request.accessToken as string, 'claim_daily_login',
    );
    if (result.status !== 'ok') throw new AppError({
      code: ErrorCode.UPSTREAM_ERROR, statusCode: 502, message: 'Pet gems storage unavailable',
    });
    return { balance: result.balance, earned: result.earned };
  });

  // Navigation credit stays off until arrival verification is decided: a client-supplied
  // coordinate cannot prove arrival, so these routes validate and authenticate but never pay,
  // store, or log coordinates.
  const coordinates = { latitude: Type.Number({ minimum: -90, maximum: 90 }), longitude: Type.Number({ minimum: -180, maximum: 180 }) };
  const navigationStart = Type.Object(
    { destinationId: Type.String({ minLength: 1, maxLength: 200 }), ...coordinates },
    { additionalProperties: false },
  );
  const navigationFinish = Type.Object(
    { tripId: Type.String({ minLength: 1, maxLength: 200 }), ...coordinates },
    { additionalProperties: false },
  );
  const navigationDisabled = {
    ...errors,
    501: ErrorResponseSchema('Navigation rewards are not available yet'),
  };
  const notAvailable = (requestId: string) => ({ error: {
    code: ErrorCode.NAVIGATION_REWARD_UNAVAILABLE,
    message: 'Navigation rewards are not available yet', requestId,
  } });

  fastify.post('/pet/rewards/navigation/start', {
    preHandler: fastify.authenticate,
    schema: { ...schema('Start a navigation trip (rewards not yet available)'), body: navigationStart, response: navigationDisabled },
  }, async (request, reply) => {
    void reply.status(501);
    return notAvailable(request.id);
  });

  fastify.post('/pet/rewards/navigation/finish', {
    preHandler: fastify.authenticate,
    schema: { ...schema('Finish a navigation trip (rewards not yet available)'), body: navigationFinish, response: navigationDisabled },
  }, async (request, reply) => {
    void reply.status(501);
    return notAvailable(request.id);
  });
  done();
};
export default petGemsRoutes;
