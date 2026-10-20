import type { FastifyServerOptions } from 'fastify';
import type { PrettyOptions } from 'pino-pretty';
import type { Environment } from './env.js';

export function getLoggerOptions(
  config: Environment,
): Exclude<FastifyServerOptions['logger'], boolean | undefined> {
  return {
    level: config.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'SUPABASE_ANON_KEY',
        'SUPABASE_SERVICE_ROLE_KEY',
        'RESEND_API_KEY',
        'MULTISET_API_KEY',
        'MAPBOX_ACCESS_TOKEN',
      ],
      censor: '[REDACTED]',
    },
  };
}

export function getPrettyOptions(
  config: Environment,
  isTTY: boolean | undefined,
): PrettyOptions | undefined {
  if (!config.LOG_PRETTY) return undefined;
  return {
    sync: true,
    colorize: isTTY ?? false,
    translateTime: 'SYS:HH:MM:ss.l',
    ignore: 'pid,hostname',
    singleLine: true,
  };
}

export function formatDuration(milliseconds: number): string {
  return milliseconds < 1000
    ? `${String(Math.round(milliseconds))}ms`
    : `${(milliseconds / 1000).toFixed(1)}s`;
}

export function requestLogUrl(url: string): string {
  const parsed = new URL(url, 'http://localhost');
  // Match the existing campus request logger's location privacy rule.
  if (parsed.pathname === '/autocomplete' && parsed.search !== '') {
    return '/autocomplete?[REDACTED]';
  }
  for (const key of [...parsed.searchParams.keys()]) {
    if (/token|password|authorization|cookie|secret|api.?key|otp|code/i.test(key)) {
      parsed.searchParams.set(key, '[REDACTED]');
    }
  }
  return parsed.pathname + parsed.search;
}
