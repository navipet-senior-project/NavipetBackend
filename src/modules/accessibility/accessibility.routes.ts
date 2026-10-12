import type { FastifyPluginCallbackTypebox } from '@fastify/type-provider-typebox';

import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { flattenPatch, toGrouped } from './accessibility.mapping.js';
import {
  GetAccessibilityRouteSchema,
  UpdateAccessibilityRouteSchema,
} from './accessibility.schema.js';
import { DEFAULT_ACCESSIBILITY_PREFERENCES } from './accessibility.types.js';

async function storageOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (cause) {
    if (cause instanceof AppError) throw cause;
    throw new AppError({
      code: ErrorCode.UPSTREAM_ERROR,
      statusCode: 502,
      message: 'Accessibility preference storage unavailable.',
      cause,
    });
  }
}

const accessibilityRoutes: FastifyPluginCallbackTypebox = (fastify, _options, done) => {
  fastify.get('/profiles/me/accessibility', {
    preHandler: fastify.authenticate,
    schema: GetAccessibilityRouteSchema,
  }, async (request) => {
    const stored = await storageOperation(() =>
      fastify.supabase.getAccessibilityPreferences(request.accessToken as string),
    );
    return { accessibility: toGrouped(stored ?? DEFAULT_ACCESSIBILITY_PREFERENCES) };
  });

  fastify.patch('/profiles/me/accessibility', {
    preHandler: fastify.authenticate,
    schema: UpdateAccessibilityRouteSchema,
  }, async (request) => {
    const updated = await storageOperation(() =>
      fastify.supabase.updateAccessibilityPreferences(
        request.accessToken as string,
        request.user?.id as string,
        flattenPatch(request.body),
      ),
    );
    return { accessibility: toGrouped(updated) };
  });

  done();
};

export default accessibilityRoutes;
