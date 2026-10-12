/**
 * Live lifecycle check for the email-change flow.
 *
 * This is deliberately NOT part of `npm test`: it talks to the real Supabase
 * project configured in .env, creates a throwaway user, and deletes it again.
 * Run it by hand after touching the email-change path:
 *
 *   npx tsx scripts/change-email-lifecycle.ts
 *
 * It proves what mocked integration tests cannot: a real password login
 * satisfies the reauthentication check, Supabase returns a standard session
 * for an email_change code (which requires "Secure email change" to be OFF in
 * Authentication > Sign In / Providers > Email), and the database trigger
 * keeps profiles.email equal to the Auth email.
 *
 * No email is sent: the code comes from generateLink, so the run needs no
 * inbox and does not depend on SMTP being configured.
 */
import { createClient } from '@supabase/supabase-js';
import { config as loadEnvFile } from 'dotenv';

import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';

const PASSWORD = 'OldPassw0rd';

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

  const stamp = String(Date.now());
  const oldEmail = `navipet-email-old-${stamp}@example.com`;
  const newEmail = `navipet-email-new-${stamp}@example.com`;
  console.log(`Using throwaway user ${oldEmail}`);

  const created = await admin.auth.admin.createUser({
    email: oldEmail,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error !== null) throw created.error;
  const userId = created.data.user.id;
  pass('created a confirmed test user');

  const app = await buildApp({ env, logger: false });
  try {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: oldEmail, password: PASSWORD },
    });
    assert(
      login.statusCode === 200,
      `login expected 200, got ${String(login.statusCode)}: ${login.body}`,
    );
    const oldToken = login.json<{ access_token: string }>().access_token;
    pass('opened a password session');

    // Asking for the current email fails with 422 only after the
    // reauthentication check passes, so this proves a real login token
    // carries a usable password timestamp without sending any email.
    const sameEmail = await app.inject({
      method: 'POST',
      url: '/auth/change-email',
      headers: { authorization: `Bearer ${oldToken}` },
      payload: { email: oldEmail },
    });
    assert(
      sameEmail.statusCode === 422,
      `change-email to the current address expected 422, got ${String(sameEmail.statusCode)}: ${sameEmail.body}`,
    );
    pass('a fresh password login satisfies the reauthentication check');

    // generateLink records the pending change and issues its OTP without
    // going through email delivery.
    const link = await admin.auth.admin.generateLink({
      type: 'email_change_new',
      email: oldEmail,
      newEmail,
    });
    if (link.error !== null) throw link.error;
    const otp = link.data.properties.email_otp;
    assert(otp.length > 0, 'Supabase returned an empty email-change OTP');
    pass('generated an email-change OTP');

    const wrong = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      payload: {
        email: newEmail,
        code: otp === '000000' ? '111111' : '000000',
        type: 'email_change',
      },
    });
    assert(
      wrong.statusCode === 401,
      `wrong code expected 401, got ${String(wrong.statusCode)}: ${wrong.body}`,
    );
    pass('a wrong code is rejected');

    const verified = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      payload: { email: newEmail, code: otp, type: 'email_change' },
    });
    assert(
      verified.statusCode === 200,
      `verify-otp expected 200, got ${String(verified.statusCode)}: ${verified.body} ` +
        '(a 502 here usually means "Secure email change" is still enabled)',
    );
    const tokens = verified.json<{ access_token: string }>();
    pass('verify-otp returned a session for the email change');

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    assert(
      me.statusCode === 200,
      `/auth/me with the new session expected 200, got ${String(me.statusCode)}: ${me.body}`,
    );
    assert(me.body.includes(newEmail), `/auth/me does not show the new email: ${me.body}`);
    pass('the new session is a standard session carrying the new email');

    const newLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: newEmail, password: PASSWORD },
    });
    assert(
      newLogin.statusCode === 200,
      `login with the new email expected 200, got ${String(newLogin.statusCode)}: ${newLogin.body}`,
    );
    pass('the new email logs in');

    const oldLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: oldEmail, password: PASSWORD },
    });
    assert(
      oldLogin.statusCode === 401,
      `login with the old email expected 401, got ${String(oldLogin.statusCode)}`,
    );
    pass('the old email no longer logs in');

    const profile = await admin
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .maybeSingle<{ email: string | null }>();
    if (profile.error !== null) throw profile.error;
    assert(
      profile.data?.email === newEmail,
      `profiles.email is ${String(profile.data?.email)}, expected ${newEmail} ` +
        '(apply supabase/migrations/20261012000000_sync_profile_email.sql)',
    );
    pass('profiles.email followed the Auth email');
  } finally {
    await app.close();
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error !== null) {
      console.error(`Failed to delete test user ${userId}:`, deleted.error.message);
    }
  }

  console.log('\nchange-email lifecycle: PASS');
}

main().catch((error: unknown) => {
  console.error('\nchange-email lifecycle: FAIL');
  console.error(error);
  process.exitCode = 1;
});
