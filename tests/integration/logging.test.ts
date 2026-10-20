import { Writable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { getLoggerOptions } from '../../src/config/logging.js';
import { TEST_ENV } from '../helpers/build-test-app.js';

function runPrettyScript(script: string, nodeEnv = 'production') {
  return spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import { buildApp } from './src/app.ts';
    import { TEST_ENV } from './tests/helpers/build-test-app.ts';
    import { AppError } from './src/common/errors/app-error.ts';
    import { ErrorCode } from './src/common/errors/error-codes.ts';
    const app = await buildApp({ env: { ...TEST_ENV, NODE_ENV: '${nodeEnv}', LOG_PRETTY: true, LOG_LEVEL: 'info' } });
    ${script}
  `], { cwd: process.cwd(), encoding: 'utf8' });
}

describe('pretty request logs', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => { await app?.close(); });

  it('emits one info summary with method URL status duration and request ID', () => {
    const child = runPrettyScript(`await app.inject({ method: 'GET', url: '/health' }); await app.close();`);
    expect(child.status).toBe(0);
    expect(child.stdout).toMatch(/INFO.*GET \/health 200 \d+ms/);
    expect(child.stdout.trim().split('\n')).toHaveLength(1);
    expect(child.stdout).toContain('reqId');
    expect(child.stdout).not.toContain('incoming request');
    expect(child.stdout).not.toContain('request completed');
  });

  it('redacts before prettifying and never logs request credentials or bodies', () => {
    const child = runPrettyScript(`
      app.log.info({ SUPABASE_ANON_KEY: 'test-key-sentinel', req: { headers: { authorization: 'Bearer test-secret', cookie: 'secret-cookie' } } }, 'redaction probe');
      await app.inject({ method: 'POST', url: '/missing?token=query-secret', headers: { authorization: 'Bearer header-secret', cookie: 'session=hidden' }, payload: { password: 'body-secret', token: 'body-token' } });
      await app.close();
    `);
    expect(child.status).toBe(0);
    expect(child.stdout).toContain('[REDACTED]');
    for (const secret of ['test-key-sentinel', 'test-secret', 'secret-cookie', 'query-secret', 'header-secret', 'body-secret', 'body-token']) expect(child.stdout).not.toContain(secret);
    expect(child.stdout).toMatch(/WARN.*POST \/missing.*404/);
  });

  it.each([false, true])('retains original request logging with injected logger and LOG_PRETTY=%s', async (prettyEnabled) => {
    let output = '';
    const stream = new Writable({ write(chunk: Buffer, _encoding, done) { output += chunk.toString(); done(); } });
    const env = { ...TEST_ENV, NODE_ENV: 'production' as const, LOG_PRETTY: prettyEnabled, LOG_LEVEL: 'info' as const };
    app = await buildApp({ env, logger: { ...getLoggerOptions(env), stream } });
    await app.inject({ method: 'GET', url: '/health' });
    const records = output.trim().split('\n').map((line) => JSON.parse(line) as { msg: string });
    expect(records.map(({ msg }) => msg)).toEqual(['incoming request', 'request completed']);
  });

  it.each(['development', 'production'])('retains AppError metadata and appropriate cause details in %s', (nodeEnv) => {
    const child = runPrettyScript(`
      app.get('/__test/upstream', () => { throw new AppError({ code: ErrorCode.UPSTREAM_ERROR, statusCode: 502, message: 'upstream unavailable', cause: { message: 'synthetic database failure', code: 'TEST_DB' } }); });
      await app.inject({ method: 'GET', url: '/__test/upstream' });
      await app.close();
    `, nodeEnv);
    expect(child.status).toBe(0);
    expect(child.stdout).toMatch(/ERROR.*GET \/__test\/upstream 502 \d+ms/);
    expect(child.stdout).toContain('"errorCode":"UPSTREAM_ERROR"');
    expect(child.stdout).toContain('"statusCode":502');
    if (nodeEnv === 'development') {
      expect(child.stdout).toContain('upstreamMessage');
      expect(child.stdout).toContain('synthetic database failure');
      expect(child.stdout).toContain('causeType');
      expect(child.stdout).toContain('causeKeys');
      expect(child.stdout).toContain('causeText');
      expect(child.stdout).toContain('TEST_DB');
    } else {
      expect(child.stdout).not.toContain('upstreamMessage');
      expect(child.stdout).not.toContain('synthetic database failure');
      expect(child.stdout).not.toContain('causeType');
      expect(child.stdout).not.toContain('causeText');
    }
  });

  it('prints an error-level 500 stack before immediate exit, without a worker flush', () => {
    const child = runPrettyScript(`
      app.get('/__test/boom', () => { throw new Error('synthetic logging failure'); });
      await app.inject({ method: 'GET', url: '/__test/boom' });
      process.exit(1);
    `);
    expect(child.status).toBe(1);
    expect(child.stdout).toMatch(/ERROR.*GET \/__test\/boom 500 \d+ms/);
    expect(child.stdout).toContain('synthetic logging failure');
    expect(child.stdout).toMatch(/at .*eval/);
    expect(child.stdout).not.toContain('incoming request');
  });
});
