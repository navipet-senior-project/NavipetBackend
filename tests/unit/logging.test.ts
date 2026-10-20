import { describe, expect, it } from 'vitest';
import { getLoggerOptions, getPrettyOptions, formatDuration, requestLogUrl } from '../../src/config/logging.js';
import { TEST_ENV } from '../helpers/build-test-app.js';

describe('logger configuration', () => {
  it.each(['development', 'test', 'production'] as const)('keeps structured options in %s without pretty', (nodeEnv) => {
    const env = { ...TEST_ENV, NODE_ENV: nodeEnv, LOG_PRETTY: false };
    expect(getPrettyOptions(env, true)).toBeUndefined();
    expect(getLoggerOptions(env)).toMatchObject({ level: 'silent', redact: { censor: '[REDACTED]' } });
    expect(getLoggerOptions(env)).not.toHaveProperty('transport');
  });
  it.each(['development', 'test', 'production'] as const)('honors pretty in %s with TTY-only colors', (nodeEnv) => {
    const env = { ...TEST_ENV, NODE_ENV: nodeEnv, LOG_PRETTY: true };
    expect(getPrettyOptions(env, true)).toMatchObject({ sync: true, colorize: true, singleLine: true, ignore: 'pid,hostname' });
    expect(getPrettyOptions(env, false)).toMatchObject({ sync: true, colorize: false });
  });
  it.each([[7.4, '7ms'], [999, '999ms'], [1000, '1.0s'], [1744, '1.7s']])('formats %s ms as %s', (value, expected) => {
    expect(formatDuration(value)).toBe(expected);
  });
  it('retains ordinary room queries but hides location and credential queries', () => {
    expect(requestLogUrl('/buildings/vec/rooms?q=215')).toBe('/buildings/vec/rooms?q=215');
    expect(requestLogUrl('/autocomplete?q=nearest&latitude=33&longitude=-118')).toBe('/autocomplete?[REDACTED]');
    const url = requestLogUrl('/health?access_token=secret&password=hidden&q=ok');
    expect(url).not.toContain('secret');
    expect(url).not.toContain('hidden');
    expect(url).toContain('q=ok');
  });
  it.each(['lat', 'latitude', 'lng', 'lon', 'longitude', 'location'])('redacts %s on every route', (key) => {
    const result = requestLogUrl(`/health?q=ok&${key}=precise-location`);
    expect(result).not.toContain('precise-location');
    expect(result).toContain('q=ok');
  });
  it('redacts room-query coordinates while retaining the room query', () => {
    const result = requestLogUrl('/buildings/vec/rooms?q=1&latitude=33&longitude=-118');
    expect(result).not.toContain('=33');
    expect(result).not.toContain('-118');
    expect(result).toContain('q=1');
  });
});
