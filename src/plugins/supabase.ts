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

const CredentialDenialCodes = new Set<string>([
  'invalid_credentials',
  'email_not_confirmed',
]);

export interface ClaimsGateway {
  getClaims(accessToken: string): Promise<unknown>;
}

export interface PasswordCredentials {
  email: string;
  password: string;
}

export interface LoginTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PasswordLoginGateway {
  signInWithPassword(
    credentials: PasswordCredentials,
  ): Promise<LoginTokens | null>;
}

export interface SupabaseResources
  extends ClaimsGateway,
    PasswordLoginGateway {
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
    async signInWithPassword(credentials) {
      const loginClient = createClient(
        config.SUPABASE_URL,
        config.SUPABASE_ANON_KEY,
        noSession,
      );
      const { data, error } = await loginClient.auth.signInWithPassword(
        credentials,
      );
      if (error !== null) {
        if (
          error.code !== undefined &&
          CredentialDenialCodes.has(error.code)
        ) {
          return null;
        }
        throw error;
      }
      return {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      };
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
