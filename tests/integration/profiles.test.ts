import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppError } from '../../src/common/errors/app-error.js';
import { ErrorCode } from '../../src/common/errors/error-codes.js';
import type { JwtVerifier } from '../../src/plugins/auth.js';
import { createSupabaseResources } from '../../src/plugins/supabase.js';
import { buildTestApp, TEST_ENV } from '../helpers/build-test-app.js';

const verifiedUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'student@example.com',
  sessionPurpose: 'standard' as const,
};

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
    expect(response.json()).toEqual({
      profile: {
        displayName: 'Jane Doe',
        email: 'student@example.com',
        role: 'student',
        avatarUrl: 'https://example.com/default-avatar.png',
      },
    });
    expect(getProfileByUserId).toHaveBeenCalledWith('valid-access-token');
  });

  it('requires authentication', async () => {
    app = await buildTestApp({}, { supabaseResources: createSupabaseResources(TEST_ENV) });
    const response = await app.inject({ method: 'GET', url: '/profiles/me' });
    expect(response.statusCode).toBe(401);
  });

  it('returns 404 when the profile does not exist', async () => {
    app = await buildTestApp({}, {
      supabaseResources: {
        ...createSupabaseResources(TEST_ENV),
        getProfileByUserId: vi.fn().mockResolvedValue(null),
      },
      authVerifier: { verify: vi.fn<JwtVerifier['verify']>().mockResolvedValue(verifiedUser) },
    });
    const response = await app.inject({
      method: 'GET',
      url: '/profiles/me',
      headers: { authorization: 'Bearer valid-access-token' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('updates the authenticated profile display name', async () => {
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
      payload: {
        displayName: '  Professor Jane Doe  ',
        role: 'professor',
        avatarUploadId: '11111111-1111-4111-8111-111111111112',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      profile: {
        displayName: 'Professor Jane Doe',
        email: 'professor@example.com',
        role: 'professor',
        avatarUrl: 'https://example.com/avatar.png',
      },
    });
    expect(updateProfile).toHaveBeenCalledWith(
      'valid-access-token',
      verifiedUser.id,
      {
        displayName: 'Professor Jane Doe',
        role: 'professor',
        avatarUploadId: '11111111-1111-4111-8111-111111111112',
      },
    );
  });

  it('rejects email updates so authentication remains the email authority', async () => {
    const updateProfile = vi.fn();
    app = await buildTestApp({}, {
      supabaseResources: { ...createSupabaseResources(TEST_ENV), updateProfile },
      authVerifier: { verify: vi.fn<JwtVerifier['verify']>().mockResolvedValue(verifiedUser) },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/profiles/me',
      headers: { authorization: 'Bearer valid-access-token' },
      payload: { email: 'new-email@example.com' },
    });

    expect(response.statusCode).toBe(422);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('rejects unexpected profile fields', async () => {
    const updateProfile = vi.fn();
    app = await buildTestApp({}, {
      supabaseResources: { ...createSupabaseResources(TEST_ENV), updateProfile },
      authVerifier: { verify: vi.fn<JwtVerifier['verify']>().mockResolvedValue(verifiedUser) },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/profiles/me',
      headers: { authorization: 'Bearer valid-access-token' },
      payload: { displayName: 'Jane Doe', timezone: 'PST' },
    });

    expect(response.statusCode).toBe(422);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('returns 404 when the avatar upload to commit does not exist', async () => {
    const updateProfile = vi.fn().mockRejectedValue(new AppError({
      code: ErrorCode.NOT_FOUND,
      statusCode: 404,
      message: 'Avatar upload not found.',
    }));
    app = await buildTestApp({}, {
      supabaseResources: { ...createSupabaseResources(TEST_ENV), updateProfile },
      authVerifier: { verify: vi.fn<JwtVerifier['verify']>().mockResolvedValue(verifiedUser) },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/profiles/me',
      headers: { authorization: 'Bearer valid-access-token' },
      payload: { avatarUploadId: '22222222-2222-4222-8222-222222222222' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('rejects an avatarUploadId that is not a UUID', async () => {
    const updateProfile = vi.fn();
    app = await buildTestApp({}, {
      supabaseResources: { ...createSupabaseResources(TEST_ENV), updateProfile },
      authVerifier: { verify: vi.fn<JwtVerifier['verify']>().mockResolvedValue(verifiedUser) },
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/profiles/me',
      headers: { authorization: 'Bearer valid-access-token' },
      payload: { avatarUploadId: '../other-user/profile' },
    });

    expect(response.statusCode).toBe(422);
    expect(updateProfile).not.toHaveBeenCalled();
  });

  describe('POST /profiles/me/avatar', () => {
    const boundary = 'avatar-test-boundary';
    const webp = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0x24, 0, 0, 0]),
      Buffer.from('WEBPVP8 '),
      Buffer.alloc(16),
    ]);

    function multipartBody(
      content: Buffer,
      options: { fieldName?: string; contentType?: string } = {},
    ): Buffer {
      const head = [
        `--${boundary}`,
        `Content-Disposition: form-data; name="${options.fieldName ?? 'avatar'}"; filename="avatar.webp"`,
        `Content-Type: ${options.contentType ?? 'image/webp'}`,
        '',
        '',
      ].join('\r\n');
      return Buffer.concat([
        Buffer.from(head),
        content,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
    }

    async function upload(
      payload: Buffer | string,
      contentType = `multipart/form-data; boundary=${boundary}`,
      uploadProfileAvatar = vi.fn().mockResolvedValue({
        uploadId: '22222222-2222-4222-8222-222222222222',
        avatarUrl: 'https://example.com/avatar-preview',
      }),
    ) {
      app = await buildTestApp({}, {
        supabaseResources: { ...createSupabaseResources(TEST_ENV), uploadProfileAvatar },
        authVerifier: { verify: vi.fn<JwtVerifier['verify']>().mockResolvedValue(verifiedUser) },
      });
      const response = await app.inject({
        method: 'POST',
        url: '/profiles/me/avatar',
        headers: {
          authorization: 'Bearer valid-access-token',
          'content-type': contentType,
        },
        payload,
      });
      return { response, uploadProfileAvatar };
    }

    it('stores a WebP avatar under the sniffed content type', async () => {
      const { response, uploadProfileAvatar } = await upload(
        multipartBody(webp, { contentType: 'application/octet-stream' }),
      );

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        uploadId: '22222222-2222-4222-8222-222222222222',
        avatarUrl: 'https://example.com/avatar-preview',
      });
      expect(uploadProfileAvatar).toHaveBeenCalledWith(verifiedUser.id, 'image/webp', webp);
    });

    it('accepts an image of exactly 5 MB', async () => {
      const image = Buffer.alloc(5 * 1024 * 1024);
      webp.copy(image);
      const { response } = await upload(multipartBody(image));

      expect(response.statusCode).toBe(200);
    });

    it('returns 413 for an image over 5 MB', async () => {
      const image = Buffer.alloc(5 * 1024 * 1024 + 1);
      webp.copy(image);
      const { response, uploadProfileAvatar } = await upload(multipartBody(image));

      expect(response.statusCode).toBe(413);
      expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
      expect(uploadProfileAvatar).not.toHaveBeenCalled();
    });

    it('returns 415 when the bytes are not a supported image', async () => {
      const { response, uploadProfileAvatar } = await upload(
        multipartBody(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
      );

      expect(response.statusCode).toBe(415);
      expect(uploadProfileAvatar).not.toHaveBeenCalled();
    });

    it('returns 415 when the request is not multipart', async () => {
      const { response } = await upload('{}', 'application/json');

      expect(response.statusCode).toBe(415);
    });

    it('returns 400 when the file uses another field name', async () => {
      const { response, uploadProfileAvatar } = await upload(
        multipartBody(webp, { fieldName: 'image' }),
      );

      expect(response.statusCode).toBe(400);
      expect(uploadProfileAvatar).not.toHaveBeenCalled();
    });

    it('returns 400 when no file is sent', async () => {
      const { response } = await upload(
        [`--${boundary}`, 'Content-Disposition: form-data; name="note"', '', 'hi', `--${boundary}--`, ''].join('\r\n'),
      );

      expect(response.statusCode).toBe(400);
    });

    it('returns 502 when Storage fails', async () => {
      const { response } = await upload(
        multipartBody(webp),
        undefined,
        vi.fn().mockRejectedValue(new Error('storage down')),
      );

      expect(response.statusCode).toBe(502);
    });

    it('requires authentication', async () => {
      app = await buildTestApp({}, { supabaseResources: createSupabaseResources(TEST_ENV) });
      const response = await app.inject({
        method: 'POST',
        url: '/profiles/me/avatar',
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
        payload: multipartBody(webp),
      });

      expect(response.statusCode).toBe(401);
    });

    it('does not accept multipart bodies on other routes', async () => {
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
        payload: multipartBody(webp),
      });

      expect(response.statusCode).toBe(415);
      expect(updateProfile).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /profiles/me/avatar/:uploadId', () => {
    const uploadId = '22222222-2222-4222-8222-222222222222';

    async function discard(result: () => Promise<boolean>, id = uploadId) {
      const discardProfileAvatar = vi.fn(result);
      app = await buildTestApp({}, {
        supabaseResources: { ...createSupabaseResources(TEST_ENV), discardProfileAvatar },
        authVerifier: { verify: vi.fn<JwtVerifier['verify']>().mockResolvedValue(verifiedUser) },
      });
      const response = await app.inject({
        method: 'DELETE',
        url: `/profiles/me/avatar/${id}`,
        headers: { authorization: 'Bearer valid-access-token' },
      });
      return { response, discardProfileAvatar };
    }

    it('discards the caller\'s pending upload', async () => {
      const { response, discardProfileAvatar } = await discard(() => Promise.resolve(true));

      expect(response.statusCode).toBe(204);
      expect(discardProfileAvatar).toHaveBeenCalledWith(verifiedUser.id, uploadId);
    });

    it('returns 404 when nothing was deleted', async () => {
      const { response } = await discard(() => Promise.resolve(false));

      expect(response.statusCode).toBe(404);
    });

    it('returns 422 for a non-UUID uploadId', async () => {
      const { response, discardProfileAvatar } = await discard(() => Promise.resolve(true), 'not-a-uuid');

      expect(response.statusCode).toBe(422);
      expect(discardProfileAvatar).not.toHaveBeenCalled();
    });

    it('returns 502 when Storage fails', async () => {
      const { response } = await discard(() => Promise.reject(new Error('storage down')));

      expect(response.statusCode).toBe(502);
    });

    it('requires authentication', async () => {
      app = await buildTestApp({}, { supabaseResources: createSupabaseResources(TEST_ENV) });
      const response = await app.inject({
        method: 'DELETE',
        url: `/profiles/me/avatar/${uploadId}`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  it('rejects an invalid role', async () => {
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
});
