import 'fastify';

import type { Environment } from '../config/env.js';
import type { AuthenticatedUser } from '../plugins/auth.js';
import type { SupabaseResources } from '../plugins/supabase.js';
import type { ExternalPlacesGateway } from '../modules/campus/campus.types.js';
import type { preHandlerAsyncHookHandler } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    config: Environment;
    supabase: SupabaseResources;
    externalPlaces: ExternalPlacesGateway;
    authenticate: preHandlerAsyncHookHandler;
    authenticateRecovery: preHandlerAsyncHookHandler;
  }

  interface FastifyRequest {
    user: AuthenticatedUser | null;
    accessToken: string | null;
  }
}
