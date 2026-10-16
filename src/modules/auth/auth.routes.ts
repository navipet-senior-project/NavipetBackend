import type { FastifyPluginCallbackTypebox } from '@fastify/type-provider-typebox';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { AUTH_CHANGE_EMAIL_REAUTH_MAX_AGE_SECONDS } from '../../config/constants.js';
import { sendEmailChangeReceipt } from './email-change-receipt.js';
import type { AuthenticatedUser } from '../../plugins/auth.js';
import {
  ChangeEmailRouteSchema,
  ForgotPasswordRouteSchema,
  LoginRouteSchema,
  LogoutAllRouteSchema,
  LogoutRouteSchema,
  MeRouteSchema,
  RefreshRouteSchema,
  RegisterRouteSchema,
  ResetPasswordRouteSchema,
  VerifyOtpRouteSchema,
} from './auth.schema.js';
import type { ProfileRole } from '../profiles/profiles.types.js';

function supabaseErrorCode(cause: unknown): string | undefined {
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) return undefined;
  return typeof cause.code === 'string' ? cause.code : undefined;
}

const authRoutes: FastifyPluginCallbackTypebox = (fastify, _options, done) => {
  const normalizeEmailPreValidation = (request: FastifyRequest): Promise<void> => {
    const body = request.body;
    if (typeof body === 'object' && body !== null) {
      const record = body as Record<string, unknown>;
      if (typeof record.email === 'string') {
        record.email = record.email.trim().toLowerCase();
      }
    }
    return Promise.resolve();
  };

  function requireAuthenticated(request: {
    user: AuthenticatedUser | null;
    accessToken: string | null;
  }): { user: AuthenticatedUser; accessToken: string } {
    if (request.user === null || request.accessToken === null) {
      throw new AppError({
        code: ErrorCode.INVALID_ACCESS_TOKEN,
        statusCode: 401,
        message: 'Authentication required',
      });
    }
    return { user: request.user, accessToken: request.accessToken };
  }

  const loginHandler = async (request: {
    body: { email: string; password: string };
  }): Promise<{ access_token: string; refresh_token: string }> => {
    const email = request.body.email.trim().toLowerCase();
    let tokens;
    try {
      tokens = await fastify.supabase.signInWithPassword({
        email,
        password: request.body.password,
      });
    } catch (cause) {
      if ((cause as { code?: string }).code === 'user_banned') {
        throw new AppError({
          code: ErrorCode.ACCOUNT_DISABLED,
          statusCode: 403,
          message: 'This account is disabled.',
          cause,
        });
      }
      throw new AppError({
        code: ErrorCode.UPSTREAM_ERROR,
        statusCode: 502,
        message: 'Supabase authentication unavailable',
        cause,
      });
    }
    if (tokens === null) {
      throw new AppError({
        code: ErrorCode.INVALID_CREDENTIALS,
        statusCode: 401,
        message: 'Email or password is incorrect.',
      });
    }
    return {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    };
  };
  const loginOptions = {
    schema: LoginRouteSchema,
    config: {
      rateLimit: {
        max: fastify.config.AUTH_LOGIN_RATE_LIMIT_MAX,
        timeWindow: fastify.config.AUTH_LOGIN_RATE_LIMIT_WINDOW,
      },
    },
  };

  fastify.post('/auth/login', loginOptions, loginHandler);

  // Normalizes email/firstName/lastName before schema validation runs, so
  // incidental surrounding whitespace does not trip the syntactic patterns
  // and the values Supabase receives are already trimmed/lowercased.
  const registerPreValidation = (request: FastifyRequest): Promise<void> => {
    const body = request.body;
    if (typeof body === 'object' && body !== null) {
      const record = body as Record<string, unknown>;
      if (typeof record.email === 'string') {
        record.email = record.email.trim().toLowerCase();
      }
      if (typeof record.firstName === 'string') {
        record.firstName = record.firstName.trim();
      }
      if (typeof record.lastName === 'string') {
        record.lastName = record.lastName.trim();
      }
    }
    return Promise.resolve();
  };

  const registerHandler = async (
    request: {
      body: {
        firstName: string;
        lastName: string;
        email: string;
        password: string;
        role: ProfileRole;
      };
    },
  ): Promise<{
    message: 'Verification code sent. Check your inbox.';
    otp_required: true;
  }> => {
    try {
      await fastify.supabase.signUp({
        email: request.body.email,
        password: request.body.password,
        firstName: request.body.firstName,
        lastName: request.body.lastName,
        role: request.body.role,
      });
    } catch (cause) {
      const code = (cause as { code?: string }).code;
      if (code === 'email_exists' || code === 'user_already_exists') {
        throw new AppError({
          code: ErrorCode.EMAIL_ALREADY_EXISTS,
          statusCode: 409,
          message: 'This email is already registered.',
          cause,
        });
      }
      if (
        code === 'over_email_send_rate_limit' ||
        code === 'over_request_rate_limit'
      ) {
        throw new AppError({
          code: ErrorCode.RATE_LIMITED,
          statusCode: 429,
          message: 'Too many registration attempts. Please try again later.',
          cause,
        });
      }
      if (code === 'weak_password' || code === 'validation_failed') {
        throw new AppError({
          code: ErrorCode.VALIDATION_ERROR,
          statusCode: 422,
          message: 'Email or password is invalid.',
          cause,
        });
      }
      throw new AppError({
        code: ErrorCode.INTERNAL_ERROR,
        statusCode: 500,
        message: 'Registration failed',
        cause,
      });
    }
    return {
      message: 'Verification code sent. Check your inbox.',
      otp_required: true,
    };
  };
  const registerOptions = {
    schema: RegisterRouteSchema,
    preValidation: registerPreValidation,
    config: {
      rateLimit: {
        max: fastify.config.AUTH_REGISTER_RATE_LIMIT_MAX,
        timeWindow: fastify.config.AUTH_REGISTER_RATE_LIMIT_WINDOW,
      },
    },
  };

  fastify.post('/auth/register', registerOptions, registerHandler);

  const refreshHandler = async (request: {
    body: { refreshToken: string };
  }): Promise<{ access_token: string; refresh_token: string }> => {
    try {
      const tokens = await fastify.supabase.refreshSession(
        request.body.refreshToken,
      );
      return { access_token: tokens.accessToken, refresh_token: tokens.refreshToken };
    } catch (cause) {
      const code = (cause as { code?: string }).code;
      if (code === 'refresh_token_already_used') {
        throw new AppError({
          code: ErrorCode.REFRESH_TOKEN_REUSED,
          statusCode: 401,
          message: 'This refresh token has already been used.',
          cause,
        });
      }
      if (
        code === 'session_purpose_not_refreshable' ||
        code === 'refresh_token_not_found' ||
        code === 'session_not_found' ||
        code === 'session_expired'
      ) {
        throw new AppError({
          code: ErrorCode.INVALID_REFRESH_TOKEN,
          statusCode: 401,
          message: 'Refresh token is invalid or expired.',
          cause,
        });
      }
      throw new AppError({
        code: ErrorCode.INTERNAL_ERROR,
        statusCode: 500,
        message: 'Refresh failed',
        cause,
      });
    }
  };
  const refreshOptions = {
    schema: RefreshRouteSchema,
    config: {
      rateLimit: {
        max: fastify.config.AUTH_REFRESH_RATE_LIMIT_MAX,
        timeWindow: fastify.config.AUTH_REFRESH_RATE_LIMIT_WINDOW,
      },
    },
  };

  fastify.post('/auth/refresh', refreshOptions, refreshHandler);

  const logoutHandler = async (
    request: { user: AuthenticatedUser | null; accessToken: string | null },
    reply: FastifyReply,
  ): Promise<void> => {
    const { accessToken } = requireAuthenticated(request);
    await fastify.supabase.adminSignOut(accessToken, 'local');
    reply.code(204);
  };
  const logoutOptions = {
    preHandler: fastify.authenticate,
    schema: LogoutRouteSchema,
  };

  fastify.post('/auth/logout', logoutOptions, logoutHandler);

  const logoutAllHandler = async (
    request: { user: AuthenticatedUser | null; accessToken: string | null },
    reply: FastifyReply,
  ): Promise<void> => {
    const { user, accessToken } = requireAuthenticated(request);
    const record = await fastify.supabase.getUserById(user.id);
    if (record === null) {
      throw new AppError({
        code: ErrorCode.USER_NOT_FOUND,
        statusCode: 404,
        message: 'User no longer exists.',
      });
    }
    await fastify.supabase.adminSignOut(accessToken, 'global');
    reply.code(204);
  };
  const logoutAllOptions = {
    preHandler: fastify.authenticate,
    schema: LogoutAllRouteSchema,
  };

  fastify.post('/auth/logout-all', logoutAllOptions, logoutAllHandler);

  const meHandler = async (request: {
    user: AuthenticatedUser | null;
    accessToken: string | null;
  }): Promise<{
    user: { id: string; email: string; status: 'ACTIVE' | 'DISABLED'; createdAt: string };
  }> => {
    const { user } = requireAuthenticated(request);
    const record = await fastify.supabase.getUserById(user.id);
    if (record === null) {
      throw new AppError({
        code: ErrorCode.USER_NOT_FOUND,
        statusCode: 404,
        message: 'User no longer exists.',
      });
    }
    if (record.status === 'DISABLED') {
      throw new AppError({
        code: ErrorCode.ACCOUNT_DISABLED,
        statusCode: 403,
        message: 'This account is disabled.',
      });
    }
    return {
      user: {
        id: record.id,
        email: record.email,
        status: record.status,
        createdAt: record.createdAt,
      },
    };
  };
  const meOptions = {
    preHandler: fastify.authenticate,
    schema: MeRouteSchema,
  };

  fastify.get('/auth/me', meOptions, meHandler);

  const forgotPasswordHandler = async (request: {
    body: { email: string };
  }): Promise<{ message: 'Verification code sent. Check your inbox.' }> => {
    let userId: string | null;
    try {
      userId = await fastify.supabase.findUserIdByEmail(request.body.email);
    } catch (cause) {
      if (cause instanceof AppError) throw cause;
      throw new AppError({
        code: ErrorCode.UPSTREAM_ERROR,
        statusCode: 502,
        message: 'Supabase is unavailable.',
        cause,
      });
    }
    if (userId === null) {
      throw new AppError({
        code: ErrorCode.USER_NOT_FOUND,
        statusCode: 404,
        message: 'No account exists for this email.',
      });
    }
    try {
      await fastify.supabase.requestPasswordReset(request.body.email);
      await fastify.supabase.createRecoveryIntent(userId);
    } catch (cause) {
      const code = (cause as { code?: string }).code;
      if (
        code === 'over_email_send_rate_limit' ||
        code === 'over_request_rate_limit'
      ) {
        throw new AppError({
          code: ErrorCode.RATE_LIMITED,
          statusCode: 429,
          message: 'Too many password reset requests. Please try again later.',
          cause,
        });
      }
      throw new AppError({
        code: ErrorCode.UPSTREAM_ERROR,
        statusCode: 502,
        message: 'Supabase is unavailable.',
        cause,
      });
    }
    return { message: 'Verification code sent. Check your inbox.' };
  };
  const forgotPasswordOptions = {
    schema: ForgotPasswordRouteSchema,
    preValidation: normalizeEmailPreValidation,
    config: {
      rateLimit: {
        max: fastify.config.AUTH_FORGOT_PASSWORD_RATE_LIMIT_MAX,
        timeWindow: fastify.config.AUTH_FORGOT_PASSWORD_RATE_LIMIT_WINDOW,
      },
    },
  };

  fastify.post('/auth/forgot-password', forgotPasswordOptions, forgotPasswordHandler);

  const changeEmailHandler = async (
    request: {
      user: AuthenticatedUser | null;
      accessToken: string | null;
      body: { email: string };
    },
    reply: FastifyReply,
  ): Promise<{ status: 'verification_required' }> => {
    const { user, accessToken } = requireAuthenticated(request);
    // A stolen access token alone must not be enough to move the account to
    // another address, so the session needs a recent password sign-in.
    const passwordAgeSeconds =
      user.passwordAuthenticatedAt === undefined
        ? undefined
        : Math.floor(Date.now() / 1000) - user.passwordAuthenticatedAt;
    if (
      passwordAgeSeconds === undefined ||
      passwordAgeSeconds > AUTH_CHANGE_EMAIL_REAUTH_MAX_AGE_SECONDS
    ) {
      throw new AppError({
        code: ErrorCode.REAUTH_REQUIRED,
        statusCode: 401,
        message: 'Sign in again with your password before changing your email.',
      });
    }
    if (
      user.email !== undefined &&
      request.body.email === user.email.trim().toLowerCase()
    ) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        statusCode: 422,
        message: 'New email must be different from the current email.',
      });
    }
    try {
      await fastify.supabase.requestEmailChange(accessToken, request.body.email);
    } catch (cause) {
      if (cause instanceof AppError) throw cause;
      const code = supabaseErrorCode(cause);
      if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') {
        throw new AppError({
          code: ErrorCode.RATE_LIMITED,
          statusCode: 429,
          message: 'Too many email-change requests. Please try again later.',
          cause,
        });
      }
      if (code === 'validation_failed' || code === 'email_address_invalid') {
        throw new AppError({
          code: ErrorCode.VALIDATION_ERROR,
          statusCode: 422,
          message: 'The new email is invalid.',
          cause,
        });
      }
      if (code === 'session_not_found' || code === 'bad_jwt') {
        throw new AppError({
          code: ErrorCode.INVALID_ACCESS_TOKEN,
          statusCode: 401,
          message: 'Authentication required',
          cause,
        });
      }
      // An address that already belongs to another account answers exactly
      // like a fresh one, so this route cannot be used to probe for accounts.
      if (code !== 'email_exists') {
        throw new AppError({
          code: ErrorCode.UPSTREAM_ERROR,
          statusCode: 502,
          message: 'Supabase is unavailable.',
          cause,
        });
      }
    }
    reply.code(202);
    return { status: 'verification_required' };
  };
  const changeEmailOptions = {
    preHandler: fastify.authenticate,
    schema: ChangeEmailRouteSchema,
    preValidation: normalizeEmailPreValidation,
    config: {
      rateLimit: {
        max: fastify.config.AUTH_CHANGE_EMAIL_RATE_LIMIT_MAX,
        timeWindow: fastify.config.AUTH_CHANGE_EMAIL_RATE_LIMIT_WINDOW,
      },
    },
  };

  fastify.post('/auth/change-email', changeEmailOptions, changeEmailHandler);

  const verifyOtpHandler = async (request: {
    body: { email: string; code: string; type: 'recovery' | 'register' | 'email_change' };
    log: FastifyRequest['log'];
  }): Promise<{ access_token: string; refresh_token: string; message?: string }> => {
    let result;
    try {
      result = await fastify.supabase.verifyOtp(
        request.body.email,
        request.body.code,
        request.body.type,
      );
    } catch (cause) {
      throw new AppError({
        code: ErrorCode.UPSTREAM_ERROR,
        statusCode: 502,
        message: 'Supabase is unavailable.',
        cause,
      });
    }
    if (result === null) {
      throw new AppError({
        code: ErrorCode.INVALID_OTP,
        statusCode: 401,
        message: 'The verification code is incorrect or has expired.',
      });
    }
    if (request.body.type === 'email_change') {
      if (fastify.config.RESEND_API_KEY === undefined) {
        request.log.warn('Email-change receipt skipped: RESEND_API_KEY is not configured');
      } else {
        // Verification already consumed the OTP. Do not hold the new session
        // behind receipt delivery, and log a failure for follow-up.
        void sendEmailChangeReceipt(request.body.email, fastify.config.RESEND_API_KEY).catch(
          (cause: unknown) => {
            request.log.error({ err: cause }, 'Email-change receipt delivery failed');
          },
        );
      }
    }
    return {
      access_token: result.tokens.accessToken,
      refresh_token: result.tokens.refreshToken,
      ...(request.body.type === 'email_change'
        ? { message: 'Email updated. Use this email the next time you sign in.' }
        : {}),
    };
  };
  const verifyOtpOptions = {
    schema: VerifyOtpRouteSchema,
    preValidation: normalizeEmailPreValidation,
    config: {
      rateLimit: {
        max: fastify.config.AUTH_VERIFY_OTP_RATE_LIMIT_MAX,
        timeWindow: fastify.config.AUTH_VERIFY_OTP_RATE_LIMIT_WINDOW,
      },
    },
  };

  fastify.post('/auth/verify-otp', verifyOtpOptions, verifyOtpHandler);

  const resetPasswordHandler = async (
    request: {
      user: AuthenticatedUser | null;
      accessToken: string | null;
      body: { newPassword: string; confirmPassword: string };
    },
    reply: FastifyReply,
  ): Promise<void> => {
    const { accessToken } = requireAuthenticated(request);
    if (request.body.newPassword !== request.body.confirmPassword) {
      throw new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        statusCode: 422,
        message: 'Passwords do not match.',
      });
    }
    try {
      await fastify.supabase.updatePassword(accessToken, request.body.newPassword);
    } catch (cause) {
      if (cause instanceof AppError) throw cause;
      const code = (cause as { code?: string }).code;
      if (code === 'same_password') {
        throw new AppError({
          code: ErrorCode.VALIDATION_ERROR,
          statusCode: 422,
          message: 'Your new password must be different from your previous password.',
          cause,
        });
      }
      if (code === 'weak_password') {
        throw new AppError({
          code: ErrorCode.VALIDATION_ERROR,
          statusCode: 422,
          message: 'Password does not meet the requirements.',
          cause,
        });
      }
      if (
        code === 'bad_jwt' ||
        code === 'session_expired' ||
        code === 'session_not_found' ||
        code === 'user_not_found'
      ) {
        throw new AppError({
          code: ErrorCode.INVALID_ACCESS_TOKEN,
          statusCode: 401,
          message: 'The recovery session is invalid or expired.',
          cause,
        });
      }
      throw new AppError({
        code: ErrorCode.INTERNAL_ERROR,
        statusCode: 500,
        message: 'Password reset failed',
        cause,
      });
    }
    try {
      await fastify.supabase.adminSignOut(accessToken, 'local');
    } catch (cause) {
      if (cause instanceof AppError) throw cause;
      throw new AppError({
        code: ErrorCode.UPSTREAM_ERROR,
        statusCode: 502,
        message: 'Password changed, but recovery-session revocation failed.',
        cause,
      });
    }
    reply.code(204);
  };
  const resetPasswordOptions = {
    preHandler: fastify.authenticateRecovery,
    schema: ResetPasswordRouteSchema,
  };

  fastify.post('/auth/reset-password', resetPasswordOptions, resetPasswordHandler);

  done();
};

export default authRoutes;
