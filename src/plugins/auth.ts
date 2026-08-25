import type {
  FastifyPluginAsync,
  FastifyRequest,
  preHandlerAsyncHookHandler,
} from 'fastify';
import fp from 'fastify-plugin';
import Type from 'typebox';
import Schema from 'typebox/schema';

import { AppError } from '../common/errors/app-error.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import type { ClaimsGateway } from './supabase.js';

const UuidPattern =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';

const ClaimsSchema = Type.Object(
  {
    sub: Type.String({ pattern: UuidPattern }),
    email: Type.Optional(Type.String()),
    iss: Type.String(),
    aud: Type.Union([Type.String(), Type.Array(Type.String())]),
    exp: Type.Number(),
  },
  { additionalProperties: true },
);

const ClaimsValidator = Schema.Compile(ClaimsSchema);

export interface AuthenticatedUser {
  id: string;
  email?: string;
}

export interface JwtVerifier {
  verify: (accessToken: string) => Promise<AuthenticatedUser>;
}

function unauthorized(cause?: unknown): AppError {
  return new AppError({
    code: ErrorCode.INVALID_ACCESS_TOKEN,
    statusCode: 401,
    message: 'Authentication required',
    cause,
  });
}

export class SupabaseJwtVerifier implements JwtVerifier {
  constructor(
    private readonly gateway: ClaimsGateway,
    private readonly issuer: string,
    private readonly audience: string,
    private readonly now: () => number = Date.now,
  ) {}

  async verify(accessToken: string): Promise<AuthenticatedUser> {
    try {
      const untrustedClaims = await this.gateway.getClaims(accessToken);
      const claims = ClaimsValidator.Parse(untrustedClaims);
      const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      const nowSeconds = Math.floor(this.now() / 1000);

      if (
        claims.iss !== this.issuer ||
        !audiences.includes(this.audience) ||
        claims.exp <= nowSeconds
      ) {
        throw unauthorized();
      }

      return {
        id: claims.sub,
        ...(claims.email === undefined ? {} : { email: claims.email }),
      };
    } catch (cause) {
      throw unauthorized(cause);
    }
  }
}

function bearerToken(request: FastifyRequest): string {
  const match = /^Bearer ([^\s,]+)$/i.exec(request.headers.authorization ?? '');
  if (match?.[1] === undefined) throw unauthorized();
  return match[1];
}

export interface AuthPluginOptions {
  verifier: JwtVerifier;
}

const authPlugin: FastifyPluginAsync<AuthPluginOptions> = (
  fastify,
  options,
) => {
  fastify.decorateRequest('user', null);
  fastify.decorateRequest('accessToken', null);

  const authenticate: preHandlerAsyncHookHandler = async (request) => {
    const accessToken = bearerToken(request);
    request.user = await options.verifier.verify(accessToken);
    request.accessToken = accessToken;
  };

  fastify.decorate('authenticate', authenticate);
  return Promise.resolve();
};

export default fp(authPlugin, {
  fastify: '5.x',
  name: 'app-auth',
  dependencies: ['app-supabase'],
});
