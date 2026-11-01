import { describe, expect, it } from 'vitest';

import {
  committedAvatarPath,
  detectAvatarContentType,
  pendingAvatarPath,
  resolveAvatarPath,
  uploadedAvatarPath,
} from '../../src/modules/profiles/profiles.avatar.js';
import { DEFAULT_AVATAR_PATH } from '../../src/modules/profiles/profiles.types.js';

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';

describe('detectAvatarContentType', () => {
  it('recognises JPEG, PNG, and WebP signatures', () => {
    expect(detectAvatarContentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(
      detectAvatarContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])),
    ).toBe('image/png');
    expect(
      detectAvatarContentType(
        Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]),
      ),
    ).toBe('image/webp');
  });

  it('rejects anything else, including truncated signatures', () => {
    expect(detectAvatarContentType(Buffer.from('<svg/>'))).toBeNull();
    expect(detectAvatarContentType(Buffer.from('GIF89a'))).toBeNull();
    expect(detectAvatarContentType(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(detectAvatarContentType(Buffer.from('RIFF\0\0\0\0WAVE'))).toBeNull();
    expect(detectAvatarContentType(Buffer.alloc(0))).toBeNull();
  });
});

describe('resolveAvatarPath', () => {
  it('supports the uploaded-avatar layout and legacy paths during transition', () => {
    const path = uploadedAvatarPath(userId, otherUserId);
    expect(path).toBe(`uploads/${userId}/${otherUserId}`);
    expect(resolveAvatarPath(userId, path)).toBe(path);

    const legacyPath = committedAvatarPath(userId, otherUserId);
    expect(resolveAvatarPath(userId, legacyPath)).toBe(legacyPath);
  });

  it('keeps paths inside the owner folder', () => {
    const path = committedAvatarPath(userId, otherUserId);
    expect(resolveAvatarPath(userId, path)).toBe(path);
    expect(resolveAvatarPath(userId, pendingAvatarPath(userId, otherUserId))).toBe(
      `${userId}/pending/${otherUserId}`,
    );
  });

  it('falls back to the default for anything outside the owner folder', () => {
    expect(resolveAvatarPath(userId, null)).toBe(DEFAULT_AVATAR_PATH);
    expect(resolveAvatarPath(userId, 'defaults/avatar.png')).toBe(DEFAULT_AVATAR_PATH);
    expect(resolveAvatarPath(userId, `${otherUserId}/profile`)).toBe(DEFAULT_AVATAR_PATH);
    expect(resolveAvatarPath(userId, `${userId}/../${otherUserId}/profile`)).toBe(
      DEFAULT_AVATAR_PATH,
    );
    expect(resolveAvatarPath(userId, userId)).toBe(DEFAULT_AVATAR_PATH);
  });
});
