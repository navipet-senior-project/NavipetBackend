/**
 * Live lifecycle check for the password-reset flow.
 *
 * This is deliberately NOT part of `npm test`: it talks to the real Supabase
 * project configured in .env, creates a throwaway user, and deletes it again.
 * Run it by hand after touching the reset path:
 *
 *   npx tsx scripts/reset-password-lifecycle.ts
 *
 * It proves the property the mocked integration tests cannot: after
 * /auth/reset-password returns 204, the recovery session that authorized the
 * request is still alive. The admin (service-role) implementation revoked every
 * session including that one, which surfaced in the client as
 * "Session from session_id claim in JWT does not exist" on the next call.
 */
import { createClient } from '@supabase/supabase-js';
import { config as loadEnvFile } from 'dotenv';

import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';

const OLD_PASSWORD = 'OldPassw0rd';
const NEW_PASSWORD = 'NewPassw0rd1';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function pass(message: string): void {
  console.log(`  ok  ${message}`);
}

async function main(): Promise<void> {
  loadEnvFile();
  const env = parseEnv(process.env);
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey === undefined) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required to create and clean up the test user',
    );
  }

  const admin = createClient(env.SUPABASE_URL, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  const email = `navipet-reset-${String(Date.now())}@example.com`;
  console.log(`Using throwaway user ${email}`);

  const created = await admin.auth.admin.createUser({
    email,
    password: OLD_PASSWORD,
    email_confirm: true,
  });
  if (created.error !== null) throw created.error;
  const userId = created.data.user.id;
  pass('created a confirmed test user');

  const app = await buildApp({ env, logger: false });
  try {
    // A second, unrelated login session, so the run can also show what the
    // reset does to the user's *other* sessions.
    const sideLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: OLD_PASSWORD },
    });
    assert(
      sideLogin.statusCode === 200,
      `side login expected 200, got ${String(sideLogin.statusCode)}: ${sideLogin.body}`,
    );
    const sideToken = sideLogin.json<{ access_token: string }>().access_token;
    pass('opened a second (password) session');

    // generateLink issues a recovery OTP without going through email delivery,
    // so the check needs no inbox.
    const link = await admin.auth.admin.generateLink({ type: 'recovery', email });
    if (link.error !== null) throw link.error;
    const otp = link.data.properties.email_otp;
    assert(otp.length > 0, 'Supabase returned an empty recovery OTP');
    pass('generated a recovery OTP');

    const verified = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      payload: { email, code: otp, type: 'recovery' },
    });
    assert(
      verified.statusCode === 200,
      `verify-otp expected 200, got ${String(verified.statusCode)}: ${verified.body}`,
    );
    const tokens = verified.json<{ access_token: string; refresh_token: string }>();
    pass('verify-otp returned a recovery session');

    const reset = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      headers: { authorization: `Bearer ${tokens.access_token}` },
      payload: { newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
    });
    assert(
      reset.statusCode === 204,
      `reset-password expected 204, got ${String(reset.statusCode)}: ${reset.body}`,
    );
    pass('reset-password returned 204');

    // The regression guard: GoTrue rejects a JWT whose session row is gone, so a
    // 200 here means the recovery session survived the password change.
    const userResponse = await fetch(
      new URL('/auth/v1/user', env.SUPABASE_URL).toString(),
      {
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          authorization: `Bearer ${tokens.access_token}`,
        },
      },
    );
    assert(
      userResponse.ok,
      `recovery access token was revoked by the reset: ${String(userResponse.status)} ${await userResponse.text()}`,
    );
    pass('recovery access token still resolves a live session');

    const sideResponse = await fetch(
      new URL('/auth/v1/user', env.SUPABASE_URL).toString(),
      {
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          authorization: `Bearer ${sideToken}`,
        },
      },
    );
    assert(
      sideResponse.status === 403,
      `the other session should have been revoked, got ${String(sideResponse.status)}`,
    );
    pass('the unrelated password session was revoked');

    const refreshed = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: tokens.refresh_token },
    });
    assert(
      refreshed.statusCode === 200,
      `refresh expected 200, got ${String(refreshed.statusCode)}: ${refreshed.body}`,
    );
    pass('recovery refresh token still rotates');

    const newLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: NEW_PASSWORD },
    });
    assert(
      newLogin.statusCode === 200,
      `login with the new password expected 200, got ${String(newLogin.statusCode)}: ${newLogin.body}`,
    );
    pass('the new password logs in');

    const oldLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: OLD_PASSWORD },
    });
    assert(
      oldLogin.statusCode === 401,
      `login with the old password expected 401, got ${String(oldLogin.statusCode)}`,
    );
    pass('the old password no longer logs in');
  } finally {
    await app.close();
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error !== null) {
      console.error(`Failed to delete test user ${userId}:`, deleted.error.message);
    }
  }

  console.log('\nreset-password lifecycle: PASS');
}

main().catch((error: unknown) => {
  console.error('\nreset-password lifecycle: FAIL');
  console.error(error);
  process.exitCode = 1;
});
