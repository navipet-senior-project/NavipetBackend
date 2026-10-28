import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JwtVerifier } from '../../src/plugins/auth.js';
import { createSupabaseResources } from '../../src/plugins/supabase.js';
import { buildTestApp, TEST_ENV } from '../helpers/build-test-app.js';

const verifiedUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'student@example.com',
  sessionPurpose: 'standard' as const,
};

const boundary = 'profile-avatar-test-boundary';
const webp = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x24, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
  Buffer.alloc(16),
]);

function multipartBody(
  parts: Array<{
    name: string;
    value: string | Buffer;
    filename?: string;
    contentType?: string;
  }>,
): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    const isFile = Buffer.isBuffer(part.value);
    const disposition = isFile
      ? `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename ?? 'avatar.webp'}"`
      : `Content-Disposition: form-data; name="${part.name}"`;
    const headers = [
      `--${boundary}`,
      disposition,
      ...(isFile ? [`Content-Type: ${part.contentType ?? 'image/webp'}`] : []),
      '',
      '',
    ].join('\r\n');
    chunks.push(Buffer.from(headers));
    chunks.push(Buffer.isBuffer(part.value) ? part.value : Buffer.from(part.value));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

describe('profiles', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => app?.close());

  it('returns the authenticated profile fields', async () => {
    const getProfileByUserId = vi.fn().mockResolvedValue({
      displayName: 'Jane Doe',
      email: 'student@example.com',
      role: 'student',
      avatarUrl: 'https://example.com/default-avatar.png',
    });
    app = await buildTestApp({}, {
      supabaseResources: { ...createSupabaseResources(TEST_ENV), getProfileByUserId },
      authVerifier: { verify: vi.fn<JwtVerifier['verify']>().mockResolvedValue(verifiedUser) },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/profiles/me',
      headers: { authorization: 'Bearer valid-access-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().profile).toMatchObject({
      displayName: 'Jane Doe',
      role: 'student',
      avatarUrl: 'https://example.com/default-avatar.png',
    });
    expect(getProfileByUserId).toHaveBeenCalledWith('valid-access-token');
  });

  it('requires authentication', async () => {
    app = await buildTestApp({}, { supabaseResources: createSupabaseResources(TEST_ENV) });
    const response = await app.inject({ method: 'GET', url: '/profiles/me' });
    expect(response.statusCode).toBe(401);
  });

  it('updates JSON profile fields without an avatar', async () => {
    const updateProfile = vi.fn().mockResolvedValue({
      displayName: 'Professor Jane Doe',
      email: 'professor@example.com',
      role: 'professor',
      avatarUrl: 'https://example.com/avatar.png',
    });
    app = await buildTestApp({}, {
      supabaseResources: { ...createSupabaseResources(TEST_ENV), updateProfile },
      authVerifier: { verify: vi.fn<JwtVerifier['verify']>().mockResolvedValue(verifiedUser) },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/profiles/me',
      headers: { authorization: 'Bearer valid-access-token' },
      payload: { displayName: '  Professor Jane Doe  ', role: 'professor' },
    });

    expect(response.statusCode).toBe(200);
    expect(updateProfile).toHaveBeenCalledWith('valid-access-token', verifiedUser.id, {
      displayName: 'Professor Jane Doe',
      role: 'professor',
    });
  });

  it('saves the avatar and profile fields together through multipart PATCH', async () => {
    const updateProfile = vi.fn().mockResolvedValue({
      displayName: 'Professor Jane Doe',
      email: 'professor@example.com',
      role: 'professor',
      avatarUrl: 'https://example.com/saved-avatar.png',
    });
    app = await buildTestApp({}, {
      supabaseResources: { ...createSupabaseResources(TEST_ENV), updateProfile },
      authVerifier: { verify: vi.fn<JwtVerifier['verify']>().mockResolvedValue(verifiedUser) },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/profiles/me',
      headers: {
        authorization: 'Bearer valid-access-token',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: multipartBody([
        { name: 'displayName', value: '  Professor Jane Doe  ' },
        { name: 'role', value: 'professor' },
        { name: 'avatar', value: webp },
      ]),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().profile.avatarUrl).toBe('https://example.com/saved-avatar.png');
    expect(updateProfile).toHaveBeenCalledWith('valid-access-token', verifiedUser.id, {
      displayName: 'Professor Jane Doe',
      role: 'professor',
      avatar: { contentType: 'image/webp', data: webp },
    });
  });

  it('accepts an avatar-only multipart profile save', async () => {
    const updateProfile = vi.fn().mockResolvedValue({
      displayName: 'Jane Doe',
      email: 'student@example.com',
      role: 'student',
      avatarUrl: 'https://example.com/saved-avatar.png',
    });
    app = await buildTestApp({}, {
      supabaseResources: { ...createSupabaseResources(TEST_ENV), updateProfile },
      authVerifier: { verify: vi.fn<JwtVerifier['verify']>().mockResolvedValue(verifiedUser) },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/profiles/me',
      headers: {
        authorization: 'Bearer valid-access-token',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: multipartBody([{ name: 'avatar', value: webp }]),
    });

    expect(response.statusCode).toBe(200);
    expect(updateProfile).toHaveBeenCalledWith('valid-access-token', verifiedUser.id, {
      avatar: { contentType: 'image/webp', data: webp },
    });
  });

  it('rejects unsupported image bytes before saving the profile', async () => {
    const updateProfile = vi.fn();
    app = await buildTestApp({}, {
      supabaseResources: { ...createSupabaseResources(TEST_ENV), updateProfile },
      authVerifier: { verify: vi.fn<JwtVerifier['verify']>().mockResolvedValue(verifiedUser) },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/profiles/me',
      headers: {
        authorization: 'Bearer valid-access-token',
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: multipartBody([{ name: 'avatar', value: Buffer.from('<svg/>') }]),
    });

    expect(response.statusCode).toBe(415);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('rejects email and unknown profile fields', async () => {
    const updateProfile = vi.fn();
    app = await buildTestApp({}, {
      supabaseResources: { ...createSupabaseResources(TEST_ENV), updateProfile },
      authVerifier: { verify: vi.fn<JwtVerifier['verify']>().mockResolvedValue(verifiedUser) },
    });

    const emailResponse = await app.inject({
      method: 'PATCH',
      url: '/profiles/me',
      headers: { authorization: 'Bearer valid-access-token' },
      payload: { email: 'new-email@example.com' },
    });
    const unknownResponse = await app.inject({
      method: 'PATCH',
      url: '/profiles/me',
      headers: { authorization: 'Bearer valid-access-token' },
      payload: { displayName: 'Jane Doe', timezone: 'PST' },
    });

    expect(emailResponse.statusCode).toBe(422);
    expect(unknownResponse.statusCode).toBe(422);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('rejects invalid roles', async () => {
    const updateProfile = vi.fn();
    app = await buildTestApp({}, {
      supabaseResources: { ...createSupabaseResources(TEST_ENV), updateProfile },
      authVerifier: { verify: vi.fn<JwtVerifier['verify']>().mockResolvedValue(verifiedUser) },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/profiles/me',
      headers: { authorization: 'Bearer valid-access-token' },
      payload: { role: 'administrator' },
    });

    expect(response.statusCode).toBe(422);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('no longer exposes a separate temporary-avatar endpoint', async () => {
    app = await buildTestApp({}, {
      authVerifier: { verify: vi.fn<JwtVerifier['verify']>().mockResolvedValue(verifiedUser) },
    });
    const response = await app.inject({ method: 'POST', url: '/profiles/me/avatar' });
    expect(response.statusCode).toBe(404);
  });
});
