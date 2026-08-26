import Type from 'typebox';
import Schema from 'typebox/schema';

import {
  DEFAULT_BODY_LIMIT_BYTES,
  DEFAULT_RATE_LIMIT_MAX,
  DEFAULT_RATE_LIMIT_WINDOW,
  DEFAULT_AUTH_LOGIN_RATE_LIMIT_MAX,
  DEFAULT_AUTH_LOGIN_RATE_LIMIT_WINDOW,
  DEFAULT_AUTH_REGISTER_RATE_LIMIT_MAX,
  DEFAULT_AUTH_REGISTER_RATE_LIMIT_WINDOW,
  DEFAULT_AUTH_REFRESH_RATE_LIMIT_MAX,
  DEFAULT_AUTH_REFRESH_RATE_LIMIT_WINDOW,
} from './constants.js';

const HttpUrl = Type.String({ pattern: '^https?://[^\\s]+$' });

const EnvironmentSchema = Type.Object(
  {
    NODE_ENV: Type.Union([
      Type.Literal('development'),
      Type.Literal('test'),
      Type.Literal('production'),
    ]),
    PORT: Type.Integer({ minimum: 1, maximum: 65_535 }),
    HOST: Type.String({ minLength: 1 }),
    LOG_LEVEL: Type.Union([
      Type.Literal('fatal'),
      Type.Literal('error'),
      Type.Literal('warn'),
      Type.Literal('info'),
      Type.Literal('debug'),
      Type.Literal('trace'),
      Type.Literal('silent'),
    ]),
    BODY_LIMIT_BYTES: Type.Integer({ minimum: 1 }),
    RATE_LIMIT_MAX: Type.Integer({ minimum: 1 }),
    RATE_LIMIT_WINDOW: Type.String({ minLength: 1 }),
    AUTH_LOGIN_RATE_LIMIT_MAX: Type.Integer({ minimum: 1 }),
    AUTH_LOGIN_RATE_LIMIT_WINDOW: Type.String({ minLength: 1 }),
    AUTH_REGISTER_RATE_LIMIT_MAX: Type.Integer({ minimum: 1 }),
    AUTH_REGISTER_RATE_LIMIT_WINDOW: Type.String({ minLength: 1 }),
    AUTH_REFRESH_RATE_LIMIT_MAX: Type.Integer({ minimum: 1 }),
    AUTH_REFRESH_RATE_LIMIT_WINDOW: Type.String({ minLength: 1 }),
    DOCS_ENABLED: Type.Boolean(),
    SUPABASE_URL: HttpUrl,
    SUPABASE_ANON_KEY: Type.String({ minLength: 1 }),
    SUPABASE_SERVICE_ROLE_KEY: Type.Optional(Type.String({ minLength: 1 })),
    SUPABASE_JWT_ISSUER: HttpUrl,
    SUPABASE_JWT_AUDIENCE: Type.String({ minLength: 1 }),
    AUTH_EMAIL_REDIRECT_URL: Type.Literal('navipet://auth-callback'),
    MULTISET_API_KEY: Type.Optional(Type.String({ minLength: 1 })),
    MULTISET_API_BASE_URL: Type.Optional(HttpUrl),
    CORS_ORIGINS: Type.Array(HttpUrl),
  },
  { additionalProperties: false },
);

const EnvironmentValidator = Schema.Compile(EnvironmentSchema);

const RateLimitWindowPattern =
  /^((?:\d+(?:\.\d+)?|\.\d+)) *(?:(m(?:illiseconds?|s(?:ecs?)?))|(s(?:ec(?:onds?|s)?)?)|(m(?:in(?:utes?|s)?)?)|(h(?:ours?|rs?)?)|(d(?:ays?)?)|(w(?:eeks?|ks?)?)|(y(?:ears?|rs?)?))?$/i;

type ParsedEnvironment = Type.Static<typeof EnvironmentSchema>;
export type Environment = Readonly<
  Omit<ParsedEnvironment, 'CORS_ORIGINS'> & {
    CORS_ORIGINS: readonly string[];
  }
>;
export type RawEnvironment = NodeJS.ProcessEnv | Record<string, string | undefined>;

function parseInteger(value: string | undefined, fallback: number): number {
  return value === undefined || value === '' ? fallback : Number(value);
}

function parseOptionalBoolean(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value as unknown as boolean;
}

function optionalValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === '' ? undefined : normalized;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.hostname.length > 0
    );
  } catch {
    return false;
  }
}

function isValidRateLimitWindow(value: string): boolean {
  const match = RateLimitWindowPattern.exec(value);
  if (match?.[1] === undefined) return false;

  const amount = Number(match[1]);
  const multiplier =
    match[2] !== undefined
      ? 1
      : match[3] !== undefined
        ? 1_000
        : match[4] !== undefined
          ? 60_000
          : match[5] !== undefined
            ? 3_600_000
            : match[6] !== undefined
              ? 86_400_000
              : match[7] !== undefined
                ? 604_800_000
                : match[8] !== undefined
                  ? 31_557_600_000
                  : 1;
  const milliseconds = amount * multiplier;
  return Number.isFinite(milliseconds) && milliseconds > 0;
}

export function parseEnv(input: RawEnvironment): Environment {
  const nodeEnv = input.NODE_ENV ?? 'development';
  const serviceRoleKey = optionalValue(input.SUPABASE_SERVICE_ROLE_KEY);
  const multisetApiKey = optionalValue(input.MULTISET_API_KEY);
  const multisetApiBaseUrl = optionalValue(input.MULTISET_API_BASE_URL);

  const candidate = {
    NODE_ENV: nodeEnv,
    PORT: parseInteger(input.PORT, 3000),
    HOST: input.HOST ?? '0.0.0.0',
    LOG_LEVEL: input.LOG_LEVEL ?? 'info',
    BODY_LIMIT_BYTES: parseInteger(
      input.BODY_LIMIT_BYTES,
      DEFAULT_BODY_LIMIT_BYTES,
    ),
    RATE_LIMIT_MAX: parseInteger(input.RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT_MAX),
    RATE_LIMIT_WINDOW: input.RATE_LIMIT_WINDOW ?? DEFAULT_RATE_LIMIT_WINDOW,
    AUTH_LOGIN_RATE_LIMIT_MAX: parseInteger(
      input.AUTH_LOGIN_RATE_LIMIT_MAX,
      DEFAULT_AUTH_LOGIN_RATE_LIMIT_MAX,
    ),
    AUTH_LOGIN_RATE_LIMIT_WINDOW:
      input.AUTH_LOGIN_RATE_LIMIT_WINDOW ?? DEFAULT_AUTH_LOGIN_RATE_LIMIT_WINDOW,
    AUTH_REGISTER_RATE_LIMIT_MAX: parseInteger(
      input.AUTH_REGISTER_RATE_LIMIT_MAX,
      DEFAULT_AUTH_REGISTER_RATE_LIMIT_MAX,
    ),
    AUTH_REGISTER_RATE_LIMIT_WINDOW:
      input.AUTH_REGISTER_RATE_LIMIT_WINDOW ??
      DEFAULT_AUTH_REGISTER_RATE_LIMIT_WINDOW,
    AUTH_REFRESH_RATE_LIMIT_MAX: parseInteger(
      input.AUTH_REFRESH_RATE_LIMIT_MAX,
      DEFAULT_AUTH_REFRESH_RATE_LIMIT_MAX,
    ),
    AUTH_REFRESH_RATE_LIMIT_WINDOW:
      input.AUTH_REFRESH_RATE_LIMIT_WINDOW ??
      DEFAULT_AUTH_REFRESH_RATE_LIMIT_WINDOW,
    DOCS_ENABLED: parseOptionalBoolean(
      input.DOCS_ENABLED,
      nodeEnv !== 'production',
    ),
    SUPABASE_URL: input.SUPABASE_URL,
    SUPABASE_ANON_KEY: input.SUPABASE_ANON_KEY,
    SUPABASE_JWT_ISSUER: input.SUPABASE_JWT_ISSUER,
    SUPABASE_JWT_AUDIENCE: input.SUPABASE_JWT_AUDIENCE,
    AUTH_EMAIL_REDIRECT_URL: input.AUTH_EMAIL_REDIRECT_URL,
    CORS_ORIGINS: (input.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    ...(serviceRoleKey === undefined
      ? {}
      : { SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey }),
    ...(multisetApiKey === undefined
      ? {}
      : { MULTISET_API_KEY: multisetApiKey }),
    ...(multisetApiBaseUrl === undefined
      ? {}
      : { MULTISET_API_BASE_URL: multisetApiBaseUrl }),
  };

  try {
    const parsed = EnvironmentValidator.Parse(candidate);
    const httpUrls = [
      parsed.SUPABASE_URL,
      parsed.SUPABASE_JWT_ISSUER,
      ...parsed.CORS_ORIGINS,
      ...(parsed.MULTISET_API_BASE_URL === undefined
        ? []
        : [parsed.MULTISET_API_BASE_URL]),
    ];
    if (
      httpUrls.some((value) => !isHttpUrl(value)) ||
      !isValidRateLimitWindow(parsed.RATE_LIMIT_WINDOW) ||
      !isValidRateLimitWindow(parsed.AUTH_LOGIN_RATE_LIMIT_WINDOW) ||
      !isValidRateLimitWindow(parsed.AUTH_REGISTER_RATE_LIMIT_WINDOW) ||
      !isValidRateLimitWindow(parsed.AUTH_REFRESH_RATE_LIMIT_WINDOW)
    ) {
      throw new Error('Environment value failed semantic validation');
    }
    return Object.freeze({
      ...parsed,
      CORS_ORIGINS: Object.freeze([...parsed.CORS_ORIGINS]),
    });
  } catch (cause) {
    throw new Error('Invalid environment configuration', { cause });
  }
}
