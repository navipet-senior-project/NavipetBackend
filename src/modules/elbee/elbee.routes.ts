import type { FastifyPluginCallbackTypebox } from '@fastify/type-provider-typebox';

import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { createSupabaseBudgetLedger, type BudgetLedger } from './elbee.budget.js';
import {
  createAnthropicModel,
  elbeeLiveReady,
  elbeeModelId,
  worstCaseMicros,
  type ElbeeModel,
} from './elbee.model.js';
import { ElbeeAskRouteSchema } from './elbee.schema.js';
import { createElbeeService } from './elbee.service.js';

export interface ElbeeOverrides {
  model?: ElbeeModel;
  ledger?: BudgetLedger;
  now?: () => Date;
  loopTimeoutMs?: number;
  toolTimeoutMs?: number;
  caps?: { globalMicros: number; userMicros: number };
}

const elbeeRoutes: FastifyPluginCallbackTypebox = (fastify, _options, done) => {
  const overrides = fastify.elbeeOverrides;
  const admin = fastify.supabase.adminClient;
  const live = elbeeLiveReady(fastify.config, admin !== null);
  const modelId = elbeeModelId(fastify.config.ELBEE_MODEL) ?? 'claude-haiku-5-5';
  const injected = overrides.model !== undefined;
  const provider = injected ? 'mock' : live ? 'anthropic' : 'disabled';
  const model =
    injected
      ? overrides.model ?? null
      : live && fastify.config.ANTHROPIC_API_KEY !== undefined
        ? createAnthropicModel(fastify.config.ANTHROPIC_API_KEY, modelId)
        : null;
  const ledger =
    overrides.ledger ??
    (live && admin !== null ? createSupabaseBudgetLedger(admin) : null);
  const service = createElbeeService({
    campus: fastify.supabase,
    listClasses: (accessToken) => fastify.supabase.listClasses(accessToken),
    model: provider === 'mock' || provider === 'anthropic' ? model : null,
    ledger: provider === 'mock' || provider === 'anthropic' ? ledger : null,
    provider,
    liveModel: provider === 'anthropic',
    caps: overrides.caps ?? {
      globalMicros: fastify.config.ELBEE_GLOBAL_DAILY_MICROS,
      userMicros: fastify.config.ELBEE_USER_DAILY_MICROS,
    },
    worstCaseMicros: worstCaseMicros(modelId),
    now: overrides.now ?? (() => new Date()),
    loopTimeoutMs: overrides.loopTimeoutMs ?? 12_000,
    toolTimeoutMs: overrides.toolTimeoutMs ?? 3_000,
  });

  fastify.post(
    '/elbee/ask',
    {
      preHandler: fastify.authenticate,
      schema: ElbeeAskRouteSchema,
      config: {
        rateLimit: {
          hook: 'preHandler',
          max: 20,
          timeWindow: '1 hour',
          keyGenerator: (request) => request.user?.id ?? request.ip,
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const userId = request.user?.id;
      const accessToken = request.accessToken;
      if (userId === undefined || accessToken === null) {
        throw new AppError({
          code: ErrorCode.INVALID_ACCESS_TOKEN,
          statusCode: 401,
          message: 'Authentication required',
        });
      }
      return service.ask({
        userId,
        accessToken,
        question: request.body.question,
        scheduleConsent: request.body.scheduleConsent,
        clientRequestId: request.body.clientRequestId ?? null,
      });
    },
  );

  done();
};

export default elbeeRoutes;
