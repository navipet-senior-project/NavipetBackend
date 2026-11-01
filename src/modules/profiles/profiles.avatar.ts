import { randomUUID } from 'node:crypto';

import { DEFAULT_AVATAR_PATH } from './profiles.types.js';

export type AvatarContentType = 'image/jpeg' | 'image/png' | 'image/webp';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Identifies an avatar image from its leading bytes. The client-declared
 * multipart content type is never trusted.
 */
export function detectAvatarContentType(bytes: Buffer): AvatarContentType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

export function uploadedAvatarPath(userId: string, objectId = randomUUID()): string {
  return `uploads/${userId}/${objectId}`;
}

// Retained for compatibility with existing avatar rows and cleanup. New
// uploads use uploadedAvatarPath and never use either legacy location.
export function pendingAvatarPath(userId: string, uploadId: string): string {
  return `${userId}/pending/${uploadId}`;
}

export function committedAvatarPath(userId: string, uploadId: string): string {
  return `${userId}/avatars/${uploadId}`;
}

export function isOwnAvatarPath(userId: string, path: string): boolean {
  return (
    !path.includes('..') &&
    (
      path.startsWith(`uploads/${userId}/`) ||
      path.startsWith(`${userId}/avatars/`) ||
      path.startsWith(`${userId}/pending/`)
    )
  );
}

/**
 * Returns the storage object to sign for a profile. `avatar_path` is writable
 * by its owner through PostgREST, so anything outside the owner's avatar
 * locations falls back to the default instead of being signed with service role.
 */
export function resolveAvatarPath(userId: string, storedPath: string | null): string {
  if (storedPath === null || !isOwnAvatarPath(userId, storedPath)) {
    return DEFAULT_AVATAR_PATH;
  }
  return storedPath;
}
