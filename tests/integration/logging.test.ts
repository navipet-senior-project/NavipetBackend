import { Writable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pretty from 'pino-pretty';
import { buildApp } from '../../src/app.js';
import { getLoggerOptions, getPrettyOptions } from '../../src/config/logging.js';
import { TEST_ENV } from '../helpers/build-test-app.js';

describe('pretty request logs', () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => { await app?.close(); });

  async function capture(prettyEnabled = true) {
    let output = '';
    const destination = new Writable({ write(chunk: Buffer, _encoding, done) { output += chunk.toString(); done(); } });
    const env = { ...TEST_ENV, NODE_ENV: 'production' as const, LOG_PRETTY: prettyEnabled, LOG_LEVEL: 'info' as const };
    const stream = prettyEnabled ? pretty({ ...getPrettyOptions(env, false), destination }) : destination;
    const server = await buildApp({ env, logger: { ...getLoggerOptions(env), stream } });
    app = server;
    return { server, output: () => output };
  }

  it('emits one summary with method URL status duration and request ID', async () => {
    const { server, output } = await capture();
    const response = await server.inject({ method: 'GET', url: '/health' });
    const text = output();
    expect(response.statusCode).toBe(200);
    expect(text).toMatch(/INFO.*GET \/health 200 \d+ms/);
    expect(text.trim().split('\n')).toHaveLength(1);
    expect(text).toContain('reqId');
    expect(text).not.toContain('incoming request');
    expect(text).not.toContain('request completed');
  });

  it('redacts before prettifying and never logs request credentials or bodies', async () => {
    const { server, output } = await capture();
    server.log.info({ SUPABASE_ANON_KEY: 'test-key-sentinel', req: { headers: { authorization: 'Bearer test-secret', cookie: 'secret-cookie' } } }, 'redaction probe');
    await server.inject({ method: 'POST', url: '/missing?token=query-secret', headers: { authorization: 'Bearer header-secret', cookie: 'session=hidden' }, payload: { password: 'body-secret', token: 'body-token' } });
    const text = output();
    expect(text).toContain('[REDACTED]');
    for (const secret of ['test-key-sentinel', 'test-secret', 'secret-cookie', 'query-secret', 'header-secret', 'body-secret', 'body-token']) expect(text).not.toContain(secret);
    expect(text).toMatch(/POST \/missing.*404/);
  });

  it('retains the original two JSON request logs when pretty is off', async () => {
    const { server, output } = await capture(false);
    await server.inject({ method: 'GET', url: '/health' });
    const records = output().trim().split('\n').map((line) => JSON.parse(line) as { msg: string });
    expect(records.map(({ msg }) => msg)).toEqual(['incoming request', 'request completed']);
  });

  it('prints a 500 stack before an immediate process exit, without a worker flush', () => {
    const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
      import { buildApp } from './src/app.ts';
      import { TEST_ENV } from './tests/helpers/build-test-app.ts';
      const app = await buildApp({ env: { ...TEST_ENV, NODE_ENV: 'production', LOG_PRETTY: true, LOG_LEVEL: 'info' } });
      app.get('/__test/boom', () => { throw new Error('synthetic logging failure'); });
      await app.inject({ method: 'GET', url: '/__test/boom' });
      process.exit(1);
    `], { cwd: process.cwd(), encoding: 'utf8' });
    expect(child.status).toBe(1);
    expect(child.stdout).toMatch(/GET \/__test\/boom 500 \d+ms/);
    expect(child.stdout).toContain('synthetic logging failure');
    expect(child.stdout).toMatch(/at .*eval/);
    expect(child.stdout).not.toContain('incoming request');
  });
});
