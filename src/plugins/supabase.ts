import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

import type { Environment } from '../config/env.js';

const noSession = {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
};

export interface ClaimsGateway {
  getClaims(accessToken: string): Promise<unknown>;
}

export interface SupabaseResources extends ClaimsGateway {
  publicClient: SupabaseClient;
  adminClient: SupabaseClient | null;
  forAccessToken(accessToken: string): SupabaseClient;
}

export function createSupabaseResources(config: Environment): SupabaseResources {
  const publicClient = createClient(
    config.SUPABASE_URL,
    config.SUPABASE_ANON_KEY,
    noSession,
  );
  const adminClient =
    config.SUPABASE_SERVICE_ROLE_KEY === undefined
      ? null
      : createClient(
          config.SUPABASE_URL,
          config.SUPABASE_SERVICE_ROLE_KEY,
          noSession,
        );

  return {
    publicClient,
    adminClient,
    forAccessToken(accessToken) {
      return createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
        ...noSession,
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });
    },
    async getClaims(accessToken) {
      const { data, error } = await publicClient.auth.getClaims(accessToken);
      if (error !== null) throw error;
      return data?.claims ?? null;
    },
  };
}

export interface SupabasePluginOptions {
  resources?: SupabaseResources;
}

const supabasePlugin: FastifyPluginAsync<SupabasePluginOptions> = (
  fastify,
  options,
) => {
  fastify.decorate(
    'supabase',
    options.resources ?? createSupabaseResources(fastify.config),
  );
  return Promise.resolve();
};

export default fp(supabasePlugin, {
  fastify: '5.x',
  name: 'app-supabase',
});
