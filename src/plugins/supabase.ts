import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

import { AppError } from '../common/errors/app-error.js';
import { ErrorCode } from '../common/errors/error-codes.js';
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

export interface SignUpCredentials {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
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

export interface SignUpResult {
  user: { id: string; email: string };
  accessToken: string | null;
  refreshToken: string | null;
}

export interface RegisterGateway {
  signUp(credentials: SignUpCredentials): Promise<SignUpResult>;
}

export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

export interface RefreshGateway {
  refreshSession(refreshToken: string): Promise<RefreshedTokens>;
}

export interface PasswordResetRequestGateway {
  requestPasswordReset(email: string): Promise<void>;
}

export type OtpType = 'recovery' | 'register';

export type VerifyOtpResult =
  | { type: 'recovery'; tokens: LoginTokens }
  | { type: 'register' };

export interface OtpVerificationGateway {
  verifyOtp(email: string, code: string, type: OtpType): Promise<VerifyOtpResult | null>;
}

export interface PasswordUpdateGateway {
  updatePassword(userId: string, newPassword: string): Promise<void>;
}

export type SignOutScope = 'local' | 'global';

export interface SessionRevocationGateway {
  adminSignOut(accessToken: string, scope: SignOutScope): Promise<void>;
}

export interface UserRecord {
  id: string;
  email: string;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
}

export interface UserLookupGateway {
  getUserById(id: string): Promise<UserRecord | null>;
}

export interface UserEmailLookupGateway {
  findUserIdByEmail(email: string): Promise<string | null>;
}

export interface SupabaseResources
  extends ClaimsGateway,
    PasswordLoginGateway,
    RegisterGateway,
    RefreshGateway,
    SessionRevocationGateway,
    UserLookupGateway,
    UserEmailLookupGateway,
    PasswordResetRequestGateway,
    OtpVerificationGateway,
    PasswordUpdateGateway {
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
    async signUp(credentials) {
      const signUpClient = createClient(
        config.SUPABASE_URL,
        config.SUPABASE_ANON_KEY,
        noSession,
      );
      const { data, error } = await signUpClient.auth.signUp({
        email: credentials.email,
        password: credentials.password,
        options: {
          data: {
            first_name: credentials.firstName,
            last_name: credentials.lastName,
            display_name: `${credentials.firstName} ${credentials.lastName}`,
          },
        },
      });
      if (error !== null) throw error;
      if (data.user === null) {
        throw new Error('Supabase signUp did not return a user');
      }
      return {
        user: { id: data.user.id, email: data.user.email ?? credentials.email },
        accessToken: data.session?.access_token ?? null,
        refreshToken: data.session?.refresh_token ?? null,
      };
    },
    async refreshSession(refreshToken) {
      const refreshClient = createClient(
        config.SUPABASE_URL,
        config.SUPABASE_ANON_KEY,
        noSession,
      );
      const { data, error } = await refreshClient.auth.refreshSession({
        refresh_token: refreshToken,
      });
      if (error !== null) throw error;
      if (data.session === null) {
        throw new Error('Supabase refreshSession did not return a session');
      }
      return {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        userId: data.session.user.id,
      };
    },
    async adminSignOut(accessToken, scope) {
      if (adminClient === null) {
        throw new AppError({
          code: ErrorCode.UPSTREAM_ERROR,
          statusCode: 503,
          message: 'Admin operations unavailable',
        });
      }
      const { error } = await adminClient.auth.admin.signOut(accessToken, scope);
      if (error !== null && error.code !== 'session_not_found') {
        throw error;
      }
    },
    async findUserIdByEmail(email) {
      if (adminClient === null) {
        throw new AppError({
          code: ErrorCode.UPSTREAM_ERROR,
          statusCode: 503,
          message: 'Admin operations unavailable',
        });
      }
      const normalized = email.toLowerCase();
      const perPage = 1000;
      for (let page = 1; ; page += 1) {
        const { data, error } = await adminClient.auth.admin.listUsers({
          page,
          perPage,
        });
        if (error !== null) throw error;
        const match = data.users.find(
          (user) => (user.email ?? '').toLowerCase() === normalized,
        );
        if (match !== undefined) return match.id;
        if (data.users.length < perPage) return null;
      }
    },
    async requestPasswordReset(email) {
      const { error } = await publicClient.auth.resetPasswordForEmail(email);
      if (error !== null) throw error;
    },
    async verifyOtp(email, code, type) {
      // Supabase's own OTP type enum has no 'register' — 'signup' is its
      // equivalent for a new-account confirmation code.
      const supabaseType = type === 'register' ? 'signup' : type;
      const { data, error } = await publicClient.auth.verifyOtp({
        email,
        token: code,
        type: supabaseType,
      });
      if (error !== null) {
        if (error.code === 'otp_expired') return null;
        throw error;
      }
      if (type === 'register') return { type };
      if (data.session === null) {
        throw new Error('Supabase verifyOtp did not return a session');
      }
      return {
        type,
        tokens: {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
        },
      };
    },
    async updatePassword(userId, newPassword) {
      if (adminClient === null) {
        throw new AppError({
          code: ErrorCode.UPSTREAM_ERROR,
          statusCode: 503,
          message: 'Admin operations unavailable',
        });
      }
      const { error } = await adminClient.auth.admin.updateUserById(userId, {
        password: newPassword,
      });
      if (error !== null) throw error;
    },
    async getUserById(id) {
      if (adminClient === null) {
        throw new AppError({
          code: ErrorCode.UPSTREAM_ERROR,
          statusCode: 503,
          message: 'Admin operations unavailable',
        });
      }
      const { data, error } = await adminClient.auth.admin.getUserById(id);
      if (error !== null) {
        if (error.code === 'user_not_found') return null;
        throw error;
      }
      return {
        id: data.user.id,
        email: data.user.email ?? '',
        status: data.user.banned_until === undefined ? 'ACTIVE' : 'DISABLED',
        createdAt: data.user.created_at,
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
